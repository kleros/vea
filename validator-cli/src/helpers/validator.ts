import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { ITransactionHandler, getTransactionHandler } from "../utils/transactionHandlers";
import { getClaim, getClaimResolveState } from "../utils/claim";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
import { getBlocksAndCheckFinality } from "../utils/arbToEthState";
import { Network } from "../consts/bridgeRoutes";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { getBlockFromEpoch } from "../utils/epochHandler";

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
  fetchTransactionHandler?: typeof getTransactionHandler;
  fetchBlockFromEpoch?: typeof getBlockFromEpoch;
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
  fetchTransactionHandler = getTransactionHandler,
  fetchBlockFromEpoch = getBlockFromEpoch,
}: ChallengeAndResolveClaimParams): Promise<ITransactionHandler | null> {
  if (!claim) {
    emitter.emit(BotEvents.NO_CLAIM, epoch);
    return null;
  }
  const queryRpc = veaRouterProvider ?? veaOutboxProvider;
  const res = await fetchBlocksAndCheckFinality(queryRpc, veaInboxProvider, epoch, epochPeriod, emitter);
  const [arbitrumBlock, , finalityIssueFlagArb, finalityIssueFlagEth] = res;
  if (res === undefined || finalityIssueFlagArb || finalityIssueFlagEth) {
    emitter.emit(BotEvents.FINALITY_ISSUE, epoch);
    return null;
  }
  const ethBlockTag = "latest";

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
  // If claim is already resolved, nothing to do
  if (claim.honest !== 0) {
    emitter.emit(BotEvents.CLAIM_ALREADY_RESOLVED, epoch);
    if (claim.honest === 2) {
      await transactionHandler.withdrawChallengeDeposit();
      return transactionHandler;
    }
    return null;
  }

  const { challenged, toRelay } = await challengeAndCheckRelay({
    veaInbox,
    epoch,
    claim,
    transactionHandler,
    arbitrumBlockNumber: arbitrumBlock.number,
  });
  if (!toRelay && !challenged) {
    return null;
  } else if (challenged && !toRelay) {
    return transactionHandler;
  }
  await handleResolveFlow({
    chainId,
    epoch,
    epochPeriod,
    claim,
    veaInbox,
    veaInboxProvider,
    veaOutbox,
    queryRpc,
    ethBlockTag,
    transactionHandler,
    fetchClaimResolveState,
    fetchBlockFromEpoch,
  });

  return transactionHandler;
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
  claim: ClaimStruct;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutbox: any;
  queryRpc: JsonRpcProvider;
  ethBlockTag: "latest" | "finalized";
  transactionHandler: ITransactionHandler;
  fetchClaimResolveState: typeof getClaimResolveState;
  fetchBlockFromEpoch: typeof getBlockFromEpoch;
}
async function handleResolveFlow({
  chainId,
  epoch,
  epochPeriod,
  claim,
  veaInbox,
  veaInboxProvider,
  veaOutbox,
  queryRpc,
  ethBlockTag,
  transactionHandler,
  fetchClaimResolveState,
  fetchBlockFromEpoch,
}: ResolveFlowParams): Promise<void> {
  const blockNumberOutboxLowerBound = await fetchBlockFromEpoch(epoch, epochPeriod, queryRpc);
  const claimResolveState = await fetchClaimResolveState({
    chainId,
    veaInbox,
    veaInboxProvider,
    veaOutbox,
    veaOutboxProvider: queryRpc,
    epoch,
    fromBlock: blockNumberOutboxLowerBound,
    toBlock: ethBlockTag,
  });

  if (!claimResolveState.sendSnapshot.status) {
    await transactionHandler.sendSnapshot();
    return;
  }
  const execStatus = claimResolveState.execution.status;
  if (execStatus === 1) {
    await transactionHandler.resolveChallengedClaim(claimResolveState.sendSnapshot.txHash);
  } else if (execStatus === 2 && claim.honest === 2) {
    await transactionHandler.withdrawChallengeDeposit();
  }
}
