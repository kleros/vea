import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { ClaimNotFoundError, ClaimScanPausedError } from "./errors";
import { getMessageStatus } from "./arbMsgExecutor";
import {
  getClaimForEpoch,
  getChallengerForClaim,
  getVerificationForClaim,
  getSnapshotSentForEpoch,
} from "./graphQueries";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents, EscapeHatchPayload } from "./botEvents";
import { Network } from "../consts/bridgeRoutes";
import { blockAtTimestamp } from "./epochHandler";
import { scanLogs, findFirstLog } from "./logScanner";
import { getOutboxReadBlock } from "./arbToEthState";

enum ClaimHonestState {
  NONE = 0,
  CLAIMER = 1,
  CHALLENGER = 2,
}

export interface ClaimParams {
  network: Network;
  chainId: number;
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  epoch: number;
  epochPeriod: number;
  emitter: typeof defaultEmitter;
  fetchClaimForEpoch?: typeof getClaimForEpoch;
  fetchVerificationForClaim?: typeof getVerificationForClaim;
  fetchChallengerForClaim?: typeof getChallengerForClaim;
  /**
   * Set for an epoch below the watch window (the watcher shares one per route and cycle): its claim
   * can be months old, so the hash-checked indexer is tried before the logs, and the scan from the
   * claim to the read block takes at most `blocksLeft` blocks, resuming next visit where it stopped
   * (`ClaimScanPausedError` until it reaches the read block). Unset: the scan is unbounded.
   */
  scanBudget?: ClaimScanBudget;
}

/** The blocks of claim-log scans left in a cycle; each scan takes what it reads from it. */
export interface ClaimScanBudget {
  blocksLeft: number;
}

/**
 * The `Challenged` and `VerificationStarted` logs of one epoch's claim, from its claim block up to
 * `scannedTo`: a budgeted scan resumes after `scannedTo` on its next visit.
 */
interface ClaimEventCursor {
  claimBlock: number;
  scannedTo: number;
  challengeLogs: any[];
  verificationLogs: any[];
}

/**
 * Per outbox contract (WeakMap: the watcher keeps one per route), by epoch: the claim last verified
 * against `claimHash`, and the cursor of its budgeted log scan. A claim hash pins every field of
 * the claim, so while it is unchanged a revisit costs the one `claimHashes` read.
 */
const claimCaches = new WeakMap<
  object,
  { verified: Map<number, { claimHash: string; claim: ClaimStruct }>; cursors: Map<number, ClaimEventCursor> }
>();
const claimCacheOf = (veaOutbox: any) => {
  let cache = claimCaches.get(veaOutbox);
  if (!cache) claimCaches.set(veaOutbox, (cache = { verified: new Map(), cursors: new Map() }));
  return cache;
};

/**
 * Block-time estimates and epoch boundaries are both approximate, so the claim
 * window is padded outward at both ends. Missing the block a claim was made in
 * is an unchallenged-fraud failure; scanning a few hundred extra blocks costs
 * at most one extra chunk.
 */
const CLAIM_WINDOW_PAD_BLOCKS = 256;

const emptyClaim = (): ClaimStruct => ({
  stateRoot: ethers.ZeroHash,
  claimer: ethers.ZeroAddress,
  timestampClaimed: 0,
  timestampVerification: 0,
  blocknumberVerification: 0,
  honest: 0,
  challenger: ethers.ZeroAddress,
});

/**
 * The challenger the stored claim names. `challenge()` has no `OnlyBridgeRunning` guard, so after
 * a challenger escape-hatch withdrawal zeroed the challenger the claim can be challenged again:
 * several challengers then exist and the stored claim names one of them. Tried newest
 * first; with none matching, the newest is returned and the hash check fails as before.
 */
const pickChallenger = (claim: ClaimStruct, challengers: string[], claimHash: string): string => {
  const newestFirst = [...challengers].reverse();
  const matching = newestFirst.find((challenger) => verifyClaimHash({ claim: { ...claim, challenger }, claimHash }));
  return matching ?? newestFirst[0] ?? ethers.ZeroAddress;
};

/**
 * Reconstruct the claim for an epoch from the outbox's own logs.
 *
 * Both outboxes require `_epoch == block.timestamp / epochPeriod - 1` inside
 * `claim()`, so a claim for epoch E can only have been made during
 * `[(E+1)*P, (E+2)*P)`. That is a hard bound, and scanning all of it is what
 * closes the detection gap: anchoring at `E*P` and clamping to a fixed block
 * count left the tail of the window unscanned.
 *
 * Reconstruction escalates. The cheapest candidate - an unchallenged, unverified
 * claim - is tried against the on-chain claim hash first, and only if that fails
 * do we pay to scan for `Challenged` and `VerificationStarted`, which cannot
 * have been emitted before the claim itself existed.
 *
 * @returns The reconstructed claim, or null if the logs could not produce one
 */
const reconstructClaimFromLogs = async (
  { veaOutbox, veaOutboxProvider, epoch, epochPeriod, emitter, scanBudget }: ClaimParams,
  claimHash: string,
  headBlock: { number: number }
): Promise<ClaimStruct | null> => {
  try {
    // The time-to-block search runs against `latest`: while finality is stalled the read
    // block is past `finalized`, and a search capped at `finalized` would cut the window's
    // tail off. The scan itself is still clamped to the read block below.
    const [windowStart, windowEnd] = await Promise.all([
      blockAtTimestamp({ provider: veaOutboxProvider, timestamp: (epoch + 1) * epochPeriod, headBlockTag: "latest" }),
      blockAtTimestamp({ provider: veaOutboxProvider, timestamp: (epoch + 2) * epochPeriod, headBlockTag: "latest" }),
    ]);
    const fromBlock = Math.max(windowStart - CLAIM_WINDOW_PAD_BLOCKS, 0);
    const toBlock = Math.min(windowEnd + CLAIM_WINDOW_PAD_BLOCKS, headBlock.number);

    // At most one `Claimed` can exist per epoch: `claim()` requires
    // `claimHashes[_epoch] == 0`, so the first hit is the only hit.
    const claimedLog = await findFirstLog({
      contract: veaOutbox,
      filter: veaOutbox.filters.Claimed(null, epoch, null),
      fromBlock,
      toBlock,
    });
    if (!claimedLog) {
      // The claim hash is non-zero, so a claim provably exists but our scan did
      // not see it. Distinct from an RPC failure, and worth its own log line.
      emitter.emit(BotEvents.CLAIMED_LOG_NOT_FOUND, epoch, fromBlock, toBlock);
      return null;
    }

    const claim = emptyClaim();
    claim.stateRoot = claimedLog.data;
    claim.claimer = `0x${claimedLog.topics[1].slice(26)}`;
    claim.timestampClaimed = (await veaOutboxProvider.getBlock(claimedLog.blockNumber)).timestamp;

    if (verifyClaimHash({ claim, claimHash })) return claim;

    const { challengeLogs, verificationLogs } = await scanClaimEvents(
      { veaOutbox, epoch, emitter, scanBudget },
      claimedLog.blockNumber,
      headBlock.number
    );
    if (verificationLogs.length > 0) {
      // `startVerification` can run again after a failed censorship test and overwrites
      // the claim's verification fields, so only the latest log describes the claim.
      const latestVerification = verificationLogs[verificationLogs.length - 1];
      claim.blocknumberVerification = latestVerification.blockNumber;
      claim.timestampVerification = (await veaOutboxProvider.getBlock(latestVerification.blockNumber)).timestamp;
    }
    claim.challenger = pickChallenger(
      claim,
      challengeLogs.map((log) => "0x" + log.topics[2].substring(26)),
      claimHash
    );
    // Logs kept in a cursor that no longer reconstruct the claim (one reorged out): rescan next visit.
    if (!verifyClaimHash({ claim, claimHash })) claimCacheOf(veaOutbox).cursors.delete(epoch);
    return claim;
  } catch (error) {
    if (error instanceof ClaimScanPausedError) throw error;
    emitter.emit(BotEvents.CLAIM_LOG_SCAN_FAILED, epoch, (error as Error)?.message);
    return null;
  }
};

/**
 * The `Challenged` and `VerificationStarted` logs of `epoch` from `claimBlock` to `toBlock`. With
 * no budget, scanned whole each time. With one, the scan resumes after the epoch's cursor and reads
 * at most `blocksLeft` blocks; short of `toBlock` it emits `CLAIM_LOG_SCAN_PAUSED` and throws
 * `ClaimScanPausedError`.
 */
const scanClaimEvents = async (
  { veaOutbox, epoch, emitter, scanBudget }: Pick<ClaimParams, "veaOutbox" | "epoch" | "emitter" | "scanBudget">,
  claimBlock: number,
  toBlock: number
): Promise<ClaimEventCursor> => {
  const scan = (fromBlock: number, upTo: number) =>
    Promise.all([
      scanLogs({ contract: veaOutbox, filter: veaOutbox.filters.Challenged(epoch, null), fromBlock, toBlock: upTo }),
      scanLogs({ contract: veaOutbox, filter: veaOutbox.filters.VerificationStarted(epoch), fromBlock, toBlock: upTo }),
    ]);
  if (!scanBudget) {
    const [challengeLogs, verificationLogs] = await scan(claimBlock, toBlock);
    return { claimBlock, scannedTo: toBlock, challengeLogs, verificationLogs };
  }
  const { cursors } = claimCacheOf(veaOutbox);
  const kept = cursors.get(epoch);
  let cursor: ClaimEventCursor =
    kept?.claimBlock === claimBlock
      ? kept
      : { claimBlock, scannedTo: claimBlock - 1, challengeLogs: [], verificationLogs: [] };
  const fromBlock = cursor.scannedTo + 1;
  const upTo = Math.min(toBlock, fromBlock + Math.max(scanBudget.blocksLeft, 0) - 1);
  if (upTo >= fromBlock) {
    const [challengeLogs, verificationLogs] = await scan(fromBlock, upTo);
    scanBudget.blocksLeft -= upTo - fromBlock + 1;
    cursor = {
      claimBlock,
      scannedTo: upTo,
      challengeLogs: [...cursor.challengeLogs, ...challengeLogs],
      verificationLogs: [...cursor.verificationLogs, ...verificationLogs],
    };
  }
  cursors.set(epoch, cursor);
  if (cursor.scannedTo < toBlock) {
    emitter.emit(BotEvents.CLAIM_LOG_SCAN_PAUSED, epoch, cursor.scannedTo, toBlock);
    throw new ClaimScanPausedError(epoch, cursor.scannedTo, toBlock);
  }
  return cursor;
};

/**
 * Reconstruct the claim for an epoch from the indexer.
 *
 * The result is only ever trusted after `verifyClaimHash` checks it against the
 * on-chain claim hash, so a wrong answer here cannot produce a wrong decision -
 * only an inability to act.
 *
 * @returns The reconstructed claim, or null if the indexer has no claim
 */
const reconstructClaimFromGraph = async (
  { chainId, veaOutbox, veaOutboxProvider, epoch, fetchClaimForEpoch = getClaimForEpoch }: ClaimParams,
  claimHash: string
): Promise<ClaimStruct | null> => {
  const claimFromGraph = await fetchClaimForEpoch(epoch, await veaOutbox.getAddress(), chainId);
  if (!claimFromGraph) return null;

  const claim = emptyClaim();
  claim.stateRoot = claimFromGraph.stateRoot;
  claim.claimer = claimFromGraph.bridger;
  claim.timestampClaimed = claimFromGraph.timestamp;
  // A restarted verification (after a failed censorship test) supersedes the earlier one.
  const latestVerification = (claimFromGraph.verification ?? [])
    .filter((verification) => verification?.startTimestamp && verification?.startTxHash)
    .reduce<{ startTimestamp: number; startTxHash: string } | null>(
      (latest, verification) =>
        latest === null || Number(verification.startTimestamp) > Number(latest.startTimestamp) ? verification : latest,
      null
    );
  if (latestVerification) {
    claim.timestampVerification = Number(latestVerification.startTimestamp);
    const txReceipt = await veaOutboxProvider.getTransactionReceipt(latestVerification.startTxHash);
    claim.blocknumberVerification = txReceipt.blockNumber;
  }
  claim.challenger = pickChallenger(
    claim,
    (claimFromGraph.challenge ?? []).map((challenge) => challenge.challenger),
    claimHash
  );
  return claim;
};

/**
 * The outbox read block and `claimHashes[epoch]` read at it. `getClaim` and
 * `getClaimResolveState` both read the claim hash through this, so both use the same read-block
 * rule (they each resolve the block, so two calls can still see different blocks).
 */
const readClaimHash = async ({
  veaOutbox,
  veaOutboxProvider,
  epoch,
  emitter,
}: {
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  epoch: number;
  emitter: typeof defaultEmitter;
}): Promise<{ readBlock: { number: number; timestamp: number }; claimHash: string }> => {
  const readBlock = await getOutboxReadBlock({ outboxProvider: veaOutboxProvider, emitter });
  const claimHash: string = await veaOutbox.claimHashes(epoch, { blockTag: readBlock.number });
  return { readBlock, claimHash };
};

/**
 * Fetch the claim for an epoch, reconstructing it from logs where possible and
 * from the indexer otherwise. Either source is only accepted once it hashes to
 * the outbox's own `claimHashes[epoch]`. The claim last accepted is kept per epoch: while
 * `claimHashes[epoch]` is unchanged it is returned with no other read. With `scanBudget` set (an
 * epoch below the watch window) the indexer is tried first and the log scan is budgeted.
 *
 * @param veaOutbox VeaOutbox contract instance
 * @param epoch epoch number of the claim to be fetched
 * @returns claim type of ClaimStruct, or null if no claim was made for the epoch
 */
const getClaim = async (params: ClaimParams): Promise<ClaimStruct | null> => {
  const { veaOutbox, veaOutboxProvider, epoch, emitter } = params;
  // The claim hash and the logs it is reconstructed from must be read at the
  // same block, the outbox chain's read block. Reading the hash at the head while
  // scanning logs only up to the read block makes reconstruction fail whenever an
  // event lands in between.
  const { readBlock: headBlock, claimHash } = await readClaimHash({ veaOutbox, veaOutboxProvider, epoch, emitter });
  const cache = claimCacheOf(veaOutbox);
  if (claimHash === ethers.ZeroHash) {
    cache.verified.delete(epoch);
    cache.cursors.delete(epoch);
    return null;
  }
  const known = cache.verified.get(epoch);
  if (known?.claimHash === claimHash) return { ...known.claim };

  const claim = await fetchVerifiedClaim(params, claimHash, headBlock);
  cache.verified.set(epoch, { claimHash, claim: { ...claim } });
  return claim;
};

/** `getClaim` past its cache: the claim variant that hashes to `claimHash`, or a throw. */
const fetchVerifiedClaim = async (
  params: ClaimParams,
  claimHash: string,
  headBlock: { number: number }
): Promise<ClaimStruct> => {
  const { epoch, emitter, scanBudget } = params;
  let claimFromGraph: ClaimStruct | null | undefined;
  if (scanBudget) {
    // An old claim's log scan runs from the claim up to the read block: the indexer goes first, and
    // any failure of it leaves the logs to decide.
    claimFromGraph = await reconstructClaimFromGraph(params, claimHash).catch(() => undefined);
    const verified = claimFromGraph && verifyClaimHash({ claim: claimFromGraph, claimHash });
    if (verified) {
      reportEscapeHatch(params, claimFromGraph!, verified);
      return verified;
    }
  }

  const claimFromLogs = await reconstructClaimFromLogs(params, claimHash, headBlock);
  const verifiedFromLogs = claimFromLogs && verifyClaimHash({ claim: claimFromLogs, claimHash });
  if (verifiedFromLogs) {
    reportEscapeHatch(params, claimFromLogs, verifiedFromLogs);
    return verifiedFromLogs;
  }

  if (claimFromGraph === undefined) claimFromGraph = await reconstructClaimFromGraph(params, claimHash);
  if (!claimFromGraph) {
    emitter.emit(BotEvents.NO_CLAIM_FETCHED, epoch);
    throw new ClaimNotFoundError(epoch);
  }
  const verifiedFromGraph = verifyClaimHash({ claim: claimFromGraph, claimHash });
  if (verifiedFromGraph) {
    reportEscapeHatch(params, claimFromGraph, verifiedFromGraph);
    return verifiedFromGraph;
  }

  emitter.emit(BotEvents.CLAIM_MISMATCH, epoch);
  throw new ClaimNotFoundError(epoch);
};

// Escape-hatch states already reported, so a state that persists is not re-reported every cycle.
const reportedEscapeHatches = new Set<string>();
const MAX_REPORTED_ESCAPE_HATCHES = 10_000;

/**
 * Emit `ESCAPE_HATCH` (`detected`) for each party whose address the matching claim variant
 * zeroed: no event records an escape-hatch withdrawal, so the zeroed address is the only trace.
 * Reported once per route, epoch, party and claim hash.
 */
const reportEscapeHatch = (
  { chainId, network, epoch, emitter }: ClaimParams,
  reconstructed: ClaimStruct,
  matched: ClaimStruct
): void => {
  const zeroed = (from: any, to: any) => from !== ethers.ZeroAddress && to === ethers.ZeroAddress;
  const parties: EscapeHatchPayload["party"][] = [];
  if (zeroed(reconstructed.claimer, matched.claimer)) parties.push("claimer");
  if (zeroed(reconstructed.challenger, matched.challenger)) parties.push("challenger");
  for (const party of parties) {
    const key = `${chainId}_${network}_${epoch}_${party}_${hashClaim(matched)}`;
    if (reportedEscapeHatches.has(key)) continue;
    if (reportedEscapeHatches.size >= MAX_REPORTED_ESCAPE_HATCHES) reportedEscapeHatches.clear();
    reportedEscapeHatches.add(key);
    const payload: EscapeHatchPayload = { chainId, network, epoch, action: "detected", party };
    emitter.emit(BotEvents.ESCAPE_HATCH, payload);
  }
};

type ClaimResolveState = {
  sendSnapshot: {
    status: boolean;
    txHash: string;
  };
  execution: {
    status: number; // 0: not ready, 1: ready, 2: executed
    txHash: string;
  };
  /**
   * Set when the outbox emitted `FailedResolution`
   * for this epoch after the last snapshot was sent, so the sent snapshot must be re-sent with
   * the current claim struct. Absent means none was seen.
   */
  failedResolution?: {
    detected: boolean;
    txHash?: string;
  };
};

/** A `SnapshotSent` log of the epoch, in inbox chain order. */
interface SnapshotSentRef {
  transactionHash: string;
  blockNumber: number;
  index: number;
}

/**
 * Every `SnapshotSent` of one epoch up to the last inbox block known to be final, so later
 * cycles only scan the blocks added since. Logs above `scannedTo` can still be
 * reorged out and are re-read every cycle.
 */
interface SnapshotSentCursor {
  scannedTo: number;
  logs: SnapshotSentRef[];
}

/**
 * The claim hash a `sendSnapshot` transaction of ours carries, decoded from its calldata; null
 * when the transaction is not a direct `sendSnapshot` call by our signer to the inbox. A
 * transaction's calldata never changes, so this is cached by hash; a missing transaction (a
 * lagging endpoint) is not cached and is looked up again next cycle.
 */
type OwnSendFacts = { claimHash: string } | null;

export interface ClaimResolveCache {
  snapshotSent: Map<string, SnapshotSentCursor>;
  ownSends: Map<string, OwnSendFacts>;
}

export const createClaimResolveCache = (): ClaimResolveCache => ({
  snapshotSent: new Map(),
  ownSends: new Map(),
});

// Production passes no cache: this one lives for the whole process.
const defaultClaimResolveCache = createClaimResolveCache();

export interface ClaimResolveStateParams {
  chainId: number;
  network?: string;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutbox: any;
  /** The outbox chain: `claimHashes` is read at its blocks. */
  veaOutboxProvider: JsonRpcProvider;
  /**
   * The provider of Arbitrum's L1 (Ethereum; on chain 10200 the Sepolia router provider),
   * used for the L2 -> L1 message status. When omitted, `veaOutboxProvider` is used, which is
   * correct only when the outbox chain is L1.
   */
  l1Provider?: JsonRpcProvider;
  /** Our signer: only `sendSnapshot` transactions sent by it are followed. */
  signerAddress?: string;
  epoch: number;
  epochPeriod: number;
  emitter?: typeof defaultEmitter;
  fetchMessageStatus?: typeof getMessageStatus;
  fetchSnapshotSentFromGraph?: typeof getSnapshotSentForEpoch;
  cache?: ClaimResolveCache;
  /**
   * Set for an epoch below the watch window (the cycle's backlog budget, shared with `getClaim`):
   * its sends are scanned for from (E+1)·P, which can be months of inbox blocks. Our final send
   * already in the cursor goes first, then the indexer's send, and the scan reads at most
   * `blocksLeft` blocks, resuming next visit (`ClaimScanPausedError` until it reaches the head).
   * Unset: unbounded.
   */
  scanBudget?: ClaimScanBudget;
}

const logIndexOf = (log: any): number => log.index ?? log.logIndex ?? 0;

const bySendOrder = (a: SnapshotSentRef, b: SnapshotSentRef): number =>
  a.blockNumber - b.blockNumber || a.index - b.index;

const sameAddress = (a: unknown, b: unknown): boolean =>
  typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

/**
 * Whether two state roots are the same bytes. A root from the indexer may be spelled in another hex
 * case than the chain's; a missing root (null, undefined) compares as `==` did.
 */
const sameRoot = (a: string | null | undefined, b: string | null | undefined): boolean =>
  typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : a == b;

/**
 * Every `SnapshotSent` for the epoch up to the inbox `latest` block. The final part is kept in
 * a per-epoch cursor, so each cycle scans only from the previous cycle's finalized block + 1 up
 * to `latest`. `sendSnapshot` requires `_epoch < block.timestamp / epochPeriod`, so nothing can
 * have been sent before (E+1)*P on the inbox clock.
 * With `scanBudget`, the blocks up to the finalized block are read at most `blocksLeft` at a
 * time (the cursor keeps what was read); the unsettled part above it, which an epoch in the window
 * reads every cycle, is read only once all of it fits in what is left (a frozen finalized block
 * cannot outrun the budget). `scannedTo` short of `latest`: paused, and
 * `sents` holds only the sends found so far, the earliest ones.
 */
const findSnapshotSents = async ({
  veaInbox,
  veaInboxProvider,
  epoch,
  epochPeriod,
  cacheKey,
  cache,
  scanBudget,
}: {
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  epoch: number;
  epochPeriod: number;
  cacheKey: string;
  cache: ClaimResolveCache;
  scanBudget?: ClaimScanBudget;
}): Promise<{ sents: SnapshotSentRef[]; scannedTo: number; latest: number }> => {
  const [latestBlock, finalizedBlock] = await Promise.all([
    veaInboxProvider.getBlock("latest"),
    veaInboxProvider.getBlock("finalized"),
  ]);
  const cursor = cache.snapshotSent.get(cacheKey);
  let fromBlock: number;
  if (cursor) {
    fromBlock = cursor.scannedTo + 1;
  } else {
    const earliestSendBlock = await blockAtTimestamp({
      provider: veaInboxProvider,
      timestamp: (epoch + 1) * epochPeriod,
      headBlockTag: "latest",
    });
    fromBlock = Math.max(earliestSendBlock - CLAIM_WINDOW_PAD_BLOCKS, 0);
  }

  let upTo = latestBlock.number;
  if (scanBudget) {
    const budgetEnd = fromBlock + Math.max(scanBudget.blocksLeft, 0) - 1;
    // The unsettled tail is not kept between visits: read it only when all of it fits in what is left.
    if (budgetEnd < latestBlock.number) upTo = Math.min(budgetEnd, finalizedBlock.number);
  }
  // A lagging endpoint after a failover can report an older head: then nothing new is scanned.
  const found: SnapshotSentRef[] =
    upTo < fromBlock
      ? []
      : (
          await scanLogs({
            contract: veaInbox,
            filter: veaInbox.filters.SnapshotSent(epoch, null),
            fromBlock,
            toBlock: upTo,
          })
        ).map((log) => ({
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          index: logIndexOf(log),
        }));
  if (scanBudget && upTo >= fromBlock) scanBudget.blocksLeft -= upTo - fromBlock + 1;

  // The cursor never moves backwards, and never past what was scanned.
  const scannedTo = Math.max(fromBlock - 1, Math.min(finalizedBlock.number, upTo));
  const settled = found.filter((log) => log.blockNumber <= scannedTo);
  const unsettled = found.filter((log) => log.blockNumber > scannedTo);
  const logs = [...(cursor?.logs ?? []), ...settled];
  cache.snapshotSent.set(cacheKey, { scannedTo, logs });
  return { sents: [...logs, ...unsettled].sort(bySendOrder), scannedTo: upTo, latest: latestBlock.number };
};

/**
 * The claim hash carried by one of our own `sendSnapshot` transactions, or null when the
 * transaction was not sent by our signer directly to the inbox. The calldata of a direct call by
 * our own key is trustworthy, so it is decoded with the inbox's own interface; nothing sent by
 * anyone else is ever followed, which is what keeps a dispute from being stalled by
 * permissionless junk tickets.
 *
 * @returns The facts, or undefined when the transaction is not known to the endpoint yet
 */
const getOwnSendFacts = async ({
  transactionHash,
  veaInbox,
  inboxAddress,
  signerAddress,
  veaInboxProvider,
  cache,
}: {
  transactionHash: string;
  veaInbox: any;
  inboxAddress: string;
  signerAddress: string;
  veaInboxProvider: JsonRpcProvider;
  cache: ClaimResolveCache;
}): Promise<OwnSendFacts | undefined> => {
  if (cache.ownSends.has(transactionHash)) return cache.ownSends.get(transactionHash) ?? null;
  const tx = await veaInboxProvider.getTransaction(transactionHash);
  if (!tx) return undefined;
  let facts: OwnSendFacts = null;
  if (sameAddress(tx.from, signerAddress) && sameAddress(tx.to, inboxAddress)) {
    try {
      const parsed = veaInbox.interface.parseTransaction({ data: tx.data });
      if (parsed?.name === "sendSnapshot") facts = { claimHash: hashClaim(parsed.args._claim as ClaimStruct) };
    } catch {
      facts = null;
    }
  }
  cache.ownSends.set(transactionHash, facts);
  return facts;
};

/** What `firstOwnCurrent` checks each send against: our signer, the inbox and the current claim hash. */
type OwnCurrentLookup = Omit<Parameters<typeof getOwnSendFacts>[0], "transactionHash"> & { claimHash: string };

/** The first of `sents` that is ours and carries the current claim. */
const firstOwnCurrent = async (
  sents: SnapshotSentRef[],
  { claimHash, ...lookup }: OwnCurrentLookup
): Promise<SnapshotSentRef | undefined> => {
  for (const sent of sents) {
    const facts = await getOwnSendFacts({ transactionHash: sent.transactionHash, ...lookup });
    if (facts?.claimHash.toLowerCase() === claimHash.toLowerCase()) return sent;
  }
  return undefined;
};

/** The indexer's `SnapshotSent` for the epoch, if any, as a send that sorts after every scanned one. */
const graphSends = async (
  fetchSnapshotSentFromGraph: typeof getSnapshotSentForEpoch,
  epoch: number,
  inboxAddress: string,
  chainId: number
): Promise<SnapshotSentRef[]> => {
  const sentSnapshotFromGraph = await fetchSnapshotSentFromGraph(epoch, inboxAddress, chainId);
  return sentSnapshotFromGraph
    ? [{ transactionHash: sentSnapshotFromGraph.txHash, blockNumber: Infinity, index: 0 }]
    : [];
};

/**
 * The `SnapshotSent` logs to check for ours, with where a budgeted scan paused short of the inbox
 * head. A failed scan is rethrown when budgeted (its cursor is partial, and its indexer send was
 * already tried); otherwise the final logs found so far and the indexer's send stand in for it.
 */
const listSnapshotSents = async (
  params: Parameters<typeof findSnapshotSents>[0],
  indexerSends: () => Promise<SnapshotSentRef[]>
): Promise<{ sents: SnapshotSentRef[]; paused?: { scannedTo: number; latest: number } }> => {
  try {
    const scan = await findSnapshotSents(params);
    return { sents: scan.sents, paused: scan.scannedTo < scan.latest ? scan : undefined };
  } catch (error) {
    if (params.scanBudget) throw error;
    // The indexer knows only one `SnapshotSent` per epoch; the final logs found so far still count.
    const sents = [...(params.cache.snapshotSent.get(params.cacheKey)?.logs ?? [])];
    for (const sent of await indexerSends()) {
      if (!sents.some((log) => log.transactionHash === sent.transactionHash)) sents.push(sent);
    }
    return { sents };
  }
};

/**
 * Fetches the claim resolve state: whether one of our own `sendSnapshot` transactions carrying
 * the current claim struct is in flight, and whether its L2 -> L1 message is ready to execute.
 *
 * Only our signer's sends count. `sendSnapshot` is permissionless and cheap, so following
 * anyone else's ticket lets a third party stall the dispute with junk; sending our own costs
 * one Arbitrum transaction per dispute. A send whose struct no longer hashes to
 * `claimHashes[E]` (the claim changed after it) is not followed, so the caller re-sends.
 * `claimHashes` is read at the outbox chain's read block, the message status on `l1Provider`.
 * With `scanBudget` (an epoch below the window) our current send already final in the scan's
 * cursor is followed, else the indexer's send when its calldata proves it ours and current;
 * otherwise the budgeted scan decides, and while it is paused short of the inbox head with no send
 * of ours found it emits `CLAIM_LOG_SCAN_PAUSED` and throws `ClaimScanPausedError`: a scan not
 * yet complete never reads as "none of ours sent".
 *
 * @returns ClaimResolveState
 */
const getClaimResolveState = async ({
  chainId,
  veaInbox,
  veaInboxProvider,
  veaOutbox,
  veaOutboxProvider,
  l1Provider,
  signerAddress,
  epoch,
  epochPeriod,
  emitter = defaultEmitter,
  fetchMessageStatus = getMessageStatus,
  fetchSnapshotSentFromGraph = getSnapshotSentForEpoch,
  cache = defaultClaimResolveCache,
  scanBudget,
}: ClaimResolveStateParams): Promise<ClaimResolveState> => {
  const claimResolveState: ClaimResolveState = {
    sendSnapshot: { status: false, txHash: "" },
    execution: { status: 0, txHash: "" },
  };
  // Without a signer nothing can be ours: the caller sends a snapshot.
  if (!signerAddress) return claimResolveState;
  const { claimHash } = await readClaimHash({ veaOutbox, veaOutboxProvider, epoch, emitter });
  if (claimHash === ethers.ZeroHash) return claimResolveState;

  const inboxAddress: string = await veaInbox.getAddress();
  const cacheKey = `${chainId}_${inboxAddress}_${epoch}`;
  const lookup: OwnCurrentLookup = { veaInbox, inboxAddress, signerAddress, veaInboxProvider, cache, claimHash };
  const indexerSends = () => graphSends(fetchSnapshotSentFromGraph, epoch, inboxAddress, chainId);

  // An old epoch's scan can take many cycles: our current send already final in its cursor, else the
  // indexer's send when it is ours, spares it. The cursor goes first, so an epoch already decided
  // does not wait on a hung indexer at every visit.
  let ours = scanBudget
    ? (await firstOwnCurrent(cache.snapshotSent.get(cacheKey)?.logs ?? [], lookup)) ??
      (await firstOwnCurrent(await indexerSends(), lookup))
    : undefined;
  if (!ours) {
    const { sents, paused } = await listSnapshotSents(
      { veaInbox, veaInboxProvider, epoch, epochPeriod, cacheKey, cache, scanBudget },
      indexerSends
    );
    ours = await firstOwnCurrent(sents, lookup);
    if (!ours && paused) {
      emitter.emit(BotEvents.CLAIM_LOG_SCAN_PAUSED, epoch, paused.scannedTo, paused.latest);
      throw new ClaimScanPausedError(epoch, paused.scannedTo, paused.latest);
    }
  }
  if (!ours) return claimResolveState;
  claimResolveState.sendSnapshot = { status: true, txHash: ours.transactionHash };

  claimResolveState.execution.status = await fetchMessageStatus(
    claimResolveState.sendSnapshot.txHash,
    veaInboxProvider,
    l1Provider ?? veaOutboxProvider
  );
  return claimResolveState;
};

/**
 * Check a reconstructed claim against the outbox's own claim hash.
 *
 * `honest` is not carried by any event, so it is recovered by trying each of the
 * three possible values. Neither is an escape-hatch withdrawal: with a live dispute,
 * `withdrawClaimerEscapeHatch` / `withdrawChallengerEscapeHatch` zero the withdrawing
 * party's address in the stored claim, so `claimer` and `challenger` are each also
 * tried as zero (`honest × {claimer, 0} × {challenger, 0}`). The *matching variant* is
 * returned rather than a boolean: the caller needs the struct that actually hashes to
 * `claimHash`, since every contract call taking a claim re-hashes it and reverts on mismatch.
 *
 * @returns The claim variant that hashes to `claimHash`, or null if none does
 */
const verifyClaimHash = ({ claim, claimHash }: { claim: ClaimStruct; claimHash: string }): ClaimStruct | null => {
  const claimers = claim.claimer === ethers.ZeroAddress ? [claim.claimer] : [claim.claimer, ethers.ZeroAddress];
  const challengers =
    claim.challenger === ethers.ZeroAddress ? [claim.challenger] : [claim.challenger, ethers.ZeroAddress];
  for (const claimer of claimers) {
    for (const challenger of challengers) {
      for (const honest of [ClaimHonestState.NONE, ClaimHonestState.CLAIMER, ClaimHonestState.CHALLENGER]) {
        const candidate = { ...claim, claimer, challenger, honest };
        if (hashClaim(candidate) === claimHash) return candidate;
      }
    }
  }
  return null;
};

/**
 * Hashes the claim data.
 *
 * @param claim - The claim data to be hashed
 *
 * @returns The hash of the claim data
 *
 */
const hashClaim = (claim: ClaimStruct) => {
  return ethers.solidityPackedKeccak256(
    ["bytes32", "address", "uint32", "uint32", "uint32", "uint8", "address"],
    [
      claim.stateRoot,
      claim.claimer,
      claim.timestampClaimed,
      claim.timestampVerification,
      claim.blocknumberVerification,
      claim.honest,
      claim.challenger,
    ]
  );
};

export { getClaim, hashClaim, verifyClaimHash, getClaimResolveState, sameRoot, ClaimHonestState, ClaimResolveState };
