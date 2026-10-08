import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { ITransactionHandler, getTransactionHandler, CannotFundError } from "../utils/transactionHandlers";
import { getClaim, getClaimResolveState } from "../utils/claim";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
import { getBlocksAndCheckFinality, getOutboxReadBlock, resolveSettledReadBlocks } from "../utils/arbToEthState";
import { Network } from "../consts/bridgeRoutes";
import { EpochOutcome, ReportOutcome } from "../utils/epochOutcome";
import { handleBridgeShutdown, isOurAddress } from "./escapeHatch";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";

export interface ChallengeAndResolveClaimParams {
  chainId: number;
  claim: ClaimStruct;
  epoch: number;
  epochPeriod: number;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutboxProvider: JsonRpcProvider;
  veaRouterProvider?: JsonRpcProvider;
  veaOutbox: any;
  transactionHandler: ITransactionHandler | null;
  emitter?: typeof defaultEmitter;
  fetchClaim?: typeof getClaim;
  fetchClaimResolveState?: typeof getClaimResolveState;
  fetchBlocksAndCheckFinality?: typeof getBlocksAndCheckFinality;
  fetchSettledReadBlocks?: typeof resolveSettledReadBlocks;
  fetchTransactionHandler?: typeof getTransactionHandler;
  /** Report what this cycle concluded for the epoch; see utils/epochOutcome.ts. */
  reportOutcome?: ReportOutcome;
}

export async function challengeAndResolveClaim({
  chainId,
  claim,
  epoch,
  epochPeriod,
  veaInbox,
  veaInboxProvider,
  veaOutboxProvider,
  veaOutbox,
  transactionHandler,
  emitter = defaultEmitter,
  veaRouterProvider,
  fetchClaimResolveState = getClaimResolveState,
  fetchBlocksAndCheckFinality = getBlocksAndCheckFinality,
  fetchSettledReadBlocks = resolveSettledReadBlocks,
  fetchTransactionHandler = getTransactionHandler,
  reportOutcome,
}: ChallengeAndResolveClaimParams): Promise<ITransactionHandler | null> {
  const report = (outcome: EpochOutcome) => reportOutcome?.(outcome);
  if (!claim) {
    emitter.emit(BotEvents.NO_CLAIM, epoch);
    report(await noClaimOutcome({ veaOutbox, veaOutboxProvider, epoch, epochPeriod, emitter }));
    return null;
  }
  // Arbitrum's L1: the Sepolia router on chain 10200, the outbox chain itself otherwise.
  const queryRpc = veaRouterProvider ?? veaOutboxProvider;

  if (!transactionHandler) {
    const TransactionHandler = fetchTransactionHandler(chainId, Network.TESTNET);
    transactionHandler = new TransactionHandler({
      chainId,
      network: Network.TESTNET, // Hardcoded as TESTNET & MAINNET have same contracts
      epoch,
      veaInbox,
      veaOutbox,
      veaInboxProvider,
      veaOutboxProvider,
      veaRouterProvider,
      emitter,
      claim,
    });
  } else {
    transactionHandler.claim = claim;
  }
  const network = transactionHandler.network ?? Network.TESTNET;
  // Resolved claims, deposit withdrawals and the escape hatch read only the outbox: they run
  // before the settled-read gate, so a deposit is recovered even when inbox or L1 reads fail.
  if (claim.honest !== 0) {
    emitter.emit(BotEvents.CLAIM_ALREADY_RESOLVED, epoch);
    return withdrawIfOurs(transactionHandler, claim, report);
  }

  const shutdownOutcome = await handleBridgeShutdown({
    transactionHandler,
    claim,
    party: "challenger",
    chainId,
    network,
    epoch,
    emitter,
  });
  if (shutdownOutcome) {
    report(shutdownOutcome);
    return shutdownOutcome === EpochOutcome.PENDING ? transactionHandler : null;
  }

  // Resolve the blocks this epoch can be read as settled at before reading
  // anything: a challenge stakes a deposit on the value we are about to read.
  const settledBlocks = await fetchSettledReadBlocks({
    inboxProvider: veaInboxProvider,
    outboxProvider: veaOutboxProvider,
    l1Provider: queryRpc,
    epoch,
    epochPeriod,
    emitter,
    fetchBlocksAndCheckFinality,
  });
  if (!settledBlocks) {
    report(EpochOutcome.UNDECIDABLE);
    return null;
  }

  const challengeState = await challengeOrCannotFund({
    veaInbox,
    epoch,
    claim,
    transactionHandler,
    arbitrumBlockNumber: settledBlocks.inboxBlock,
  });
  if (!challengeState) {
    report(EpochOutcome.UNDECIDABLE);
    return transactionHandler;
  }
  const { challenged, toRelay } = challengeState;
  if (!toRelay && !challenged) {
    // A matching claim of ours stays watched until it is verified: a later challenge of it
    // still needs our snapshot to be resolved. A third party's matching claim leaves nothing
    // for us to challenge.
    report(isOurAddress(transactionHandler, claim.claimer) ? EpochOutcome.PENDING : EpochOutcome.DONE);
    return null;
  } else if (challenged && !toRelay) {
    report(EpochOutcome.PENDING);
    return transactionHandler;
  }
  await handleResolveFlow({
    chainId,
    epoch,
    epochPeriod,
    veaInbox,
    veaInboxProvider,
    veaOutbox,
    veaOutboxProvider,
    queryRpc,
    transactionHandler,
    fetchClaimResolveState,
  });
  report(EpochOutcome.PENDING);
  return transactionHandler;
}

/**
 * A resolved claim: withdraw the challenge deposit when the challenger won and it is ours
 * (withdrawing deletes the claim hash, so the epoch is done once getClaim finds no claim);
 * otherwise nothing is left for us.
 */
const withdrawIfOurs = async (
  transactionHandler: ITransactionHandler,
  claim: ClaimStruct,
  report: (outcome: EpochOutcome) => void
): Promise<ITransactionHandler | null> => {
  if (claim.honest === 2 && isOurAddress(transactionHandler, claim.challenger)) {
    await transactionHandler.withdrawChallengeDeposit();
    report(EpochOutcome.PENDING);
    return transactionHandler;
  }
  report(EpochOutcome.DONE);
  return null;
};

/** `challengeAndCheckRelay`, with a funding shortfall returned as null rather than thrown. */
const challengeOrCannotFund = async (
  params: ChallengeAndCheckRelayParams
): Promise<{ challenged: boolean; toRelay: boolean } | null> => {
  try {
    return await challengeAndCheckRelay(params);
  } catch (err) {
    if (err instanceof CannotFundError) return null;
    throw err;
  }
};

interface NoClaimOutcomeParams {
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  epoch: number;
  epochPeriod: number;
  emitter: typeof defaultEmitter;
}

/**
 * With no claim found, the epoch is done only when no claim can still appear: the outbox read
 * block is at or past `(E+2)·epochPeriod` (`claim` only accepts the previous epoch) and
 * `claimHashes(E)` is zero at that same block.
 */
async function noClaimOutcome({
  veaOutbox,
  veaOutboxProvider,
  epoch,
  epochPeriod,
  emitter,
}: NoClaimOutcomeParams): Promise<EpochOutcome> {
  try {
    const readBlock = await getOutboxReadBlock({ outboxProvider: veaOutboxProvider, emitter });
    if (readBlock.timestamp < (epoch + 2) * epochPeriod) return EpochOutcome.PENDING;
    const claimHash = await veaOutbox.claimHashes(epoch, { blockTag: readBlock.number });
    return claimHash == ethers.ZeroHash ? EpochOutcome.DONE : EpochOutcome.PENDING;
  } catch {
    return EpochOutcome.UNDECIDABLE;
  }
}

interface ChallengeAndCheckRelayParams {
  veaInbox: any;
  epoch: number;
  claim: ClaimStruct;
  transactionHandler: ITransactionHandler;
  arbitrumBlockNumber: number;
}
async function challengeAndCheckRelay({
  veaInbox,
  epoch,
  claim,
  transactionHandler,
  arbitrumBlockNumber,
}: ChallengeAndCheckRelayParams): Promise<{ challenged: boolean; toRelay: boolean }> {
  const onChainSnapshot = await veaInbox.snapshots(epoch, { blockTag: arbitrumBlockNumber });
  const isNotChallenged = claim.challenger === ethers.ZeroAddress;
  const challengeAndRelayState = {
    challenged: false,
    toRelay: false,
  };
  if (onChainSnapshot !== claim.stateRoot && isNotChallenged) {
    await transactionHandler.challengeClaim();
    challengeAndRelayState.challenged = true;
  }
  if (!isNotChallenged) {
    return { challenged: true, toRelay: true };
  }
  return challengeAndRelayState;
}

interface ResolveFlowParams {
  chainId: number;
  epoch: number;
  epochPeriod: number;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutbox: any;
  /** The outbox chain: `claimHashes` is read at its blocks. */
  veaOutboxProvider: JsonRpcProvider;
  /** Arbitrum's L1, for the L2 -> L1 message status. */
  queryRpc: JsonRpcProvider;
  transactionHandler: ITransactionHandler;
  fetchClaimResolveState: typeof getClaimResolveState;
}
async function handleResolveFlow({
  chainId,
  epoch,
  epochPeriod,
  veaInbox,
  veaInboxProvider,
  veaOutbox,
  veaOutboxProvider,
  queryRpc,
  transactionHandler,
  fetchClaimResolveState,
}: ResolveFlowParams): Promise<void> {
  // The lookup searches the inbox up to its latest block ([L16]), so our own send is adopted
  // by the next cycle: re-send only while no ticket is adopted. A ticket whose resolution
  // could fail no longer hashes to claimHashes[E] and is not adopted ([L20]), so it is re-sent too.
  const claimResolveState = await fetchClaimResolveState({
    chainId,
    veaInbox,
    veaInboxProvider,
    veaOutbox,
    veaOutboxProvider,
    l1Provider: queryRpc,
    epoch,
    epochPeriod,
  });
  if (!claimResolveState.sendSnapshot.status) {
    await transactionHandler.sendSnapshot();
    return;
  }
  if (claimResolveState.execution.status === 1) {
    await transactionHandler.resolveChallengedClaim(claimResolveState.sendSnapshot.txHash);
  }
}
