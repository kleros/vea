import { EventEmitter } from "events";
import { ethers } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getClaim, ClaimHonestState } from "../utils/claim";
import { getBlocksAndCheckFinality, getOutboxReadBlock, resolveSettledReadBlocks } from "../utils/arbToEthState";
import { getLastClaimedEpoch } from "../utils/graphQueries";
import { BotEvents } from "../utils/botEvents";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import {
  ITransactionHandler,
  IDevnetTransactionHandler,
  getTransactionHandler,
  CannotFundError,
} from "../utils/transactionHandlers";
import { Network } from "../consts/bridgeRoutes";
import { EpochOutcome, ReportOutcome } from "../utils/epochOutcome";
import { getLookbackFloorBlock } from "../utils/epochHandler";
import { findLatestLog } from "../utils/logScanner";
import { handleBridgeShutdown, isOurAddress } from "./escapeHatch";
interface CheckAndClaimParams {
  chainId: number;
  network: Network;
  claim: ClaimStruct | null;
  epochPeriod: number;
  epoch: number;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  veaRouterProvider?: JsonRpcProvider;
  transactionHandler: ITransactionHandler | null;
  emitter: EventEmitter;
  fetchClaim?: typeof getClaim;
  fetchLatestClaimedEpoch?: typeof getLastClaimedEpoch;
  fetchTransactionHandler?: typeof getTransactionHandler;
  fetchBlocksAndCheckFinality?: typeof getBlocksAndCheckFinality;
  fetchSettledReadBlocks?: typeof resolveSettledReadBlocks;
  /** Milliseconds. Defaults to the outbox chain's latest block timestamp, never the host clock. */
  now?: number;
  /** Report what this cycle concluded for the epoch; see utils/epochOutcome.ts. */
  reportOutcome?: ReportOutcome;
}

async function checkAndClaim({
  chainId,
  network,
  claim,
  epoch,
  epochPeriod,
  veaInbox,
  veaInboxProvider,
  veaOutbox,
  veaOutboxProvider,
  transactionHandler,
  emitter,
  veaRouterProvider,
  fetchLatestClaimedEpoch = getLastClaimedEpoch,
  fetchTransactionHandler = getTransactionHandler,
  fetchBlocksAndCheckFinality = getBlocksAndCheckFinality,
  fetchSettledReadBlocks = resolveSettledReadBlocks,
  now,
  reportOutcome,
}: CheckAndClaimParams) {
  const report = (outcome: EpochOutcome) => reportOutcome?.(outcome);
  if (!transactionHandler) {
    const TransactionHandler = fetchTransactionHandler(chainId, network);
    transactionHandler = new TransactionHandler({
      chainId,
      network,
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
  try {
    if (network == Network.DEVNET) {
      return await makeClaimDevnet(
        epoch,
        claim,
        transactionHandler as IDevnetTransactionHandler,
        veaInbox,
        veaOutbox,
        emitter,
        report
      );
    }
    if (claim != null) {
      return await verifyClaim({
        chainId,
        network,
        epoch,
        epochPeriod,
        transactionHandler,
        claim,
        veaInbox,
        veaOutboxProvider,
        l1Provider: veaRouterProvider ?? veaOutboxProvider,
        emitter,
        report,
        fetchBlocksAndCheckFinality,
        fetchSettledReadBlocks,
      });
    }
    // Epoch arithmetic runs on chain time: a host clock that is off must not move the claimable epoch.
    const nowMs = now ?? (await veaOutboxProvider.getBlock("latest")).timestamp * 1000;
    const claimAbleEpoch = Math.floor(nowMs / (1000 * epochPeriod)) - 1;
    if (epoch == claimAbleEpoch) {
      return await makeClaim({
        chainId,
        epoch,
        epochPeriod,
        transactionHandler,
        veaInbox,
        veaOutbox,
        veaOutboxProvider,
        l1Provider: veaRouterProvider ?? veaOutboxProvider,
        emitter,
        report,
        fetchLatestClaimedEpoch,
        fetchBlocksAndCheckFinality,
        fetchSettledReadBlocks,
      });
    }
    if (epoch < claimAbleEpoch) {
      emitter.emit(BotEvents.CLAIM_EPOCH_PASSED, epoch);
      report(await passedEpochOutcome({ epoch, epochPeriod, veaOutbox, veaOutboxProvider, emitter }));
    } else {
      // The epoch has not ended on the outbox chain yet: nothing can be claimed for it.
      report(EpochOutcome.UNDECIDABLE);
    }
    return null;
  } catch (err) {
    if (err instanceof CannotFundError) {
      report(EpochOutcome.UNDECIDABLE);
      return transactionHandler;
    }
    throw err;
  }
}

/**
 * An unclaimed epoch whose claim window has passed on the latest block is done only once the
 * outbox read block is at or past `(E+2)·epochPeriod` too and `claimHashes(E)` is zero at that
 * same block: the claim was looked up at an earlier block, and one can land in between.
 */
async function passedEpochOutcome({
  epoch,
  epochPeriod,
  veaOutbox,
  veaOutboxProvider,
  emitter,
}: {
  epoch: number;
  epochPeriod: number;
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  emitter: EventEmitter;
}): Promise<EpochOutcome> {
  try {
    const readBlock = await getOutboxReadBlock({ outboxProvider: veaOutboxProvider, emitter: emitter as any });
    if (readBlock.timestamp < (epoch + 2) * epochPeriod) return EpochOutcome.PENDING;
    const claimHash = await veaOutbox.claimHashes(epoch, { blockTag: readBlock.number });
    return claimHash == ethers.ZeroHash ? EpochOutcome.DONE : EpochOutcome.PENDING;
  } catch {
    return EpochOutcome.UNDECIDABLE;
  }
}

async function makeClaimDevnet(
  epoch: number,
  claim: ClaimStruct | null,
  transactionHandler: IDevnetTransactionHandler,
  veaInbox: any,
  veaOutbox: any,
  emitter: EventEmitter,
  report: ReportOutcome
): Promise<IDevnetTransactionHandler | null> {
  if (claim == null) {
    const [savedSnapshot, outboxStateRoot] = await Promise.all([veaInbox.snapshots(epoch), veaOutbox.stateRoot()]);

    const newMessagesToBridge = savedSnapshot != outboxStateRoot && savedSnapshot != ethers.ZeroHash;
    if (newMessagesToBridge) {
      await transactionHandler.devnetAdvanceState(savedSnapshot);
      report(EpochOutcome.PENDING);
      return transactionHandler;
    }
  }
  emitter.emit(BotEvents.NO_CLAIM_REQUIRED, epoch);
  report(EpochOutcome.DONE);
  return null;
}

interface MakeClaimParams {
  chainId: number;
  epoch: number;
  epochPeriod: number;
  transactionHandler: ITransactionHandler;
  veaInbox: any;
  veaOutbox: any;
  /** The outbox chain: `stateRoot` and the `Claimed` scan are read here. */
  veaOutboxProvider: JsonRpcProvider;
  /** Arbitrum's L1 (the Sepolia router provider on chain 10200): the finality check runs here. */
  l1Provider: JsonRpcProvider;
  emitter: EventEmitter;
  report: ReportOutcome;
  fetchLatestClaimedEpoch: typeof getLastClaimedEpoch;
  fetchBlocksAndCheckFinality: typeof getBlocksAndCheckFinality;
  fetchSettledReadBlocks: typeof resolveSettledReadBlocks;
}

async function makeClaim({
  chainId,
  epoch,
  epochPeriod,
  transactionHandler,
  veaInbox,
  veaOutbox,
  veaOutboxProvider,
  l1Provider,
  emitter,
  report,
  fetchLatestClaimedEpoch,
  fetchBlocksAndCheckFinality,
  fetchSettledReadBlocks,
}: MakeClaimParams): Promise<ITransactionHandler | null> {
  // Claiming stakes a deposit on the snapshot we are about to read, so resolve
  // the settled blocks first and read only at them.
  const settledBlocks = await fetchSettledReadBlocks({
    inboxProvider: transactionHandler.veaInboxProvider,
    outboxProvider: veaOutboxProvider,
    l1Provider,
    epoch,
    epochPeriod,
    emitter: emitter as any,
    fetchBlocksAndCheckFinality,
  });
  if (!settledBlocks) {
    report(EpochOutcome.UNDECIDABLE);
    return null;
  }

  const savedSnapshot = await veaInbox.snapshots(epoch, { blockTag: settledBlocks.inboxBlock });
  if (savedSnapshot == ethers.ZeroHash) {
    // snapshots[epoch] is final once the epoch has ended, so no snapshot means nothing to claim.
    emitter.emit(BotEvents.NO_SNAPSHOT);
    report(EpochOutcome.DONE);
    return null;
  }
  const outboxStateRoot = await veaOutbox.stateRoot({ blockTag: settledBlocks.outboxBlock });
  const lastClaimedStateroot = await findLastClaimedStateRoot({
    chainId,
    epoch,
    epochPeriod,
    veaOutbox,
    veaOutboxProvider,
    emitter,
    fetchLatestClaimedEpoch,
  });
  if (lastClaimedStateroot === undefined) {
    report(EpochOutcome.UNDECIDABLE);
    return null;
  }
  // With no claim found at all, the outbox state root alone decides.
  const newMessagesToBridge =
    savedSnapshot != outboxStateRoot && (lastClaimedStateroot === null || savedSnapshot != lastClaimedStateroot);
  if (newMessagesToBridge) {
    await transactionHandler.makeClaim(savedSnapshot);
    report(EpochOutcome.PENDING);
    return transactionHandler;
  }
  emitter.emit(BotEvents.NO_NEW_MESSAGES);
  report(EpochOutcome.DONE);
  return null;
}

/**
 * The state root of the latest claim: first from a `Claimed` scan over the lookback window on
 * the outbox chain's own blocks, then from the indexer.
 *
 * @returns the state root, null when neither source has a claim, undefined when neither could answer
 */
async function findLastClaimedStateRoot({
  chainId,
  epoch,
  epochPeriod,
  veaOutbox,
  veaOutboxProvider,
  emitter,
  fetchLatestClaimedEpoch,
}: {
  chainId: number;
  epoch: number;
  epochPeriod: number;
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  emitter: EventEmitter;
  fetchLatestClaimedEpoch: typeof getLastClaimedEpoch;
}): Promise<string | null | undefined> {
  let scanFailed = false;
  try {
    const [floorBlock, headBlock] = await Promise.all([
      getLookbackFloorBlock({ provider: veaOutboxProvider, chainId, epochPeriod }),
      getOutboxReadBlock({ outboxProvider: veaOutboxProvider, emitter: emitter as any }),
    ]);
    const lastClaimLog = await findLatestLog({
      contract: veaOutbox,
      filter: veaOutbox.filters.Claimed(),
      fromBlock: Math.min(floorBlock, headBlock.number),
      toBlock: headBlock.number,
    });
    if (lastClaimLog) return lastClaimLog.data;
  } catch (err) {
    scanFailed = true;
    emitter.emit(BotEvents.CLAIM_LOG_SCAN_FAILED, epoch, err instanceof Error ? err.message : String(err));
  }
  // The lookback window had no Claimed (a quiet bridge) or the scan failed: ask the indexer.
  try {
    const claimData = await fetchLatestClaimedEpoch(veaOutbox.target, chainId);
    if (claimData?.stateRoot) return claimData.stateRoot;
    // An empty indexer answer means "no prior claim" only when the scan saw the window empty too.
    return scanFailed ? undefined : null;
  } catch {
    // An empty window is an answer; an indexer error after a failed scan leaves none.
    return scanFailed ? undefined : null;
  }
}

interface VerifyClaimParams {
  chainId: number;
  network: Network;
  epoch: number;
  epochPeriod: number;
  transactionHandler: ITransactionHandler;
  claim: ClaimStruct;
  veaInbox: any;
  veaOutboxProvider: JsonRpcProvider;
  l1Provider: JsonRpcProvider;
  emitter: EventEmitter;
  report: ReportOutcome;
  fetchBlocksAndCheckFinality: typeof getBlocksAndCheckFinality;
  fetchSettledReadBlocks: typeof resolveSettledReadBlocks;
}

async function verifyClaim({
  chainId,
  network,
  epoch,
  epochPeriod,
  transactionHandler,
  claim,
  veaInbox,
  veaOutboxProvider,
  l1Provider,
  emitter,
  report,
  fetchBlocksAndCheckFinality,
  fetchSettledReadBlocks,
}: VerifyClaimParams): Promise<ITransactionHandler | null> {
  const ours = isOurAddress(transactionHandler, claim.claimer);
  if (claim.honest == ClaimHonestState.CLAIMER) {
    if (!ours) {
      // Another claimer's deposit: not ours to withdraw.
      report(EpochOutcome.DONE);
      return null;
    }
    // Withdrawing deletes the claim hash; the epoch is done once getClaim finds no claim.
    await transactionHandler.withdrawClaimDeposit();
    report(EpochOutcome.PENDING);
    return transactionHandler;
  }
  if (claim.honest != ClaimHonestState.NONE) {
    // The challenger won: nothing is left for the claimer.
    report(EpochOutcome.DONE);
    return null;
  }
  const shutdownOutcome = await handleBridgeShutdown({
    transactionHandler,
    claim,
    party: "claimer",
    chainId,
    network,
    epoch,
    emitter,
  });
  if (shutdownOutcome) {
    report(shutdownOutcome);
    return shutdownOutcome === EpochOutcome.PENDING ? transactionHandler : null;
  }
  if (claim.challenger != ethers.ZeroAddress) {
    // In dispute: the challenger path drives resolution.
    report(EpochOutcome.PENDING);
    return transactionHandler;
  }
  if (!ours) {
    // A third party's claim is verified too (it is what advances `latestVerifiedEpoch`), but
    // only once it is checked against `snapshots[E]` at a settled inbox block: the claimer never
    // pushes a claim it has not checked toward verification. A mismatch is fraud, which the
    // challenger path handles; it is reported here too, since `--path=claimer` runs no challenger.
    const settledBlocks = await fetchSettledReadBlocks({
      inboxProvider: transactionHandler.veaInboxProvider,
      outboxProvider: veaOutboxProvider,
      l1Provider,
      epoch,
      epochPeriod,
      emitter: emitter as any,
      fetchBlocksAndCheckFinality,
    });
    if (!settledBlocks) {
      report(EpochOutcome.UNDECIDABLE);
      return null;
    }
    const savedSnapshot = await veaInbox.snapshots(epoch, { blockTag: settledBlocks.inboxBlock });
    // Compare the bytes, not the spelling: a root from the indexer may differ in hex case.
    if (String(savedSnapshot).toLowerCase() !== String(claim.stateRoot).toLowerCase()) {
      emitter.emit(BotEvents.ALERT, {
        level: "error",
        code: "claim_mismatch_unverified",
        chainId,
        network,
        epoch,
        details: { claimer: claim.claimer, claimed: claim.stateRoot, snapshot: savedSnapshot },
      });
      report(EpochOutcome.PENDING);
      return transactionHandler;
    }
  }
  // The outbox read block (finalized, or latest minus 64 during a finality stall).
  const readBlock = await getOutboxReadBlock({ outboxProvider: veaOutboxProvider, emitter: emitter as any });
  if (claim.timestampVerification == 0) {
    await transactionHandler.startVerification(readBlock.timestamp);
  } else {
    await transactionHandler.verifySnapshot(readBlock.timestamp);
  }
  report(EpochOutcome.PENDING);
  return transactionHandler;
}

export { checkAndClaim, CheckAndClaimParams };
