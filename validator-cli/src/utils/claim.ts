import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { ClaimNotFoundError } from "./errors";
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
}

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
  { veaOutbox, veaOutboxProvider, epoch, epochPeriod, emitter }: ClaimParams,
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

    const [challengeLogs, verificationLogs] = await Promise.all([
      scanLogs({
        contract: veaOutbox,
        filter: veaOutbox.filters.Challenged(epoch, null),
        fromBlock: claimedLog.blockNumber,
        toBlock: headBlock.number,
      }),
      scanLogs({
        contract: veaOutbox,
        filter: veaOutbox.filters.VerificationStarted(epoch),
        fromBlock: claimedLog.blockNumber,
        toBlock: headBlock.number,
      }),
    ]);
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
    return claim;
  } catch (error) {
    emitter.emit(BotEvents.CLAIM_LOG_SCAN_FAILED, epoch, (error as Error)?.message);
    return null;
  }
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
 * the outbox's own `claimHashes[epoch]`.
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
  if (claimHash === ethers.ZeroHash) return null;

  const claimFromLogs = await reconstructClaimFromLogs(params, claimHash, headBlock);
  const verifiedFromLogs = claimFromLogs && verifyClaimHash({ claim: claimFromLogs, claimHash });
  if (verifiedFromLogs) {
    reportEscapeHatch(params, claimFromLogs, verifiedFromLogs);
    return verifiedFromLogs;
  }

  const claimFromGraph = await reconstructClaimFromGraph(params, claimHash);
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
}

const logIndexOf = (log: any): number => log.index ?? log.logIndex ?? 0;

const bySendOrder = (a: SnapshotSentRef, b: SnapshotSentRef): number =>
  a.blockNumber - b.blockNumber || a.index - b.index;

const sameAddress = (a: unknown, b: unknown): boolean =>
  typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

/**
 * Every `SnapshotSent` for the epoch up to the inbox `latest` block. The final part is kept in
 * a per-epoch cursor, so each cycle scans only from the previous cycle's finalized block + 1 up
 * to `latest`. `sendSnapshot` requires `_epoch < block.timestamp / epochPeriod`, so nothing can
 * have been sent before (E+1)*P on the inbox clock.
 */
const findSnapshotSents = async ({
  veaInbox,
  veaInboxProvider,
  epoch,
  epochPeriod,
  cacheKey,
  cache,
}: {
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  epoch: number;
  epochPeriod: number;
  cacheKey: string;
  cache: ClaimResolveCache;
}): Promise<SnapshotSentRef[]> => {
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

  // A lagging endpoint after a failover can report an older head: then nothing new is scanned.
  const found: SnapshotSentRef[] =
    latestBlock.number < fromBlock
      ? []
      : (
          await scanLogs({
            contract: veaInbox,
            filter: veaInbox.filters.SnapshotSent(epoch, null),
            fromBlock,
            toBlock: latestBlock.number,
          })
        ).map((log) => ({
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          index: logIndexOf(log),
        }));

  // The cursor never moves backwards, and never past what was scanned.
  const scannedTo = Math.max(fromBlock - 1, Math.min(finalizedBlock.number, latestBlock.number));
  const settled = found.filter((log) => log.blockNumber <= scannedTo);
  const unsettled = found.filter((log) => log.blockNumber > scannedTo);
  const logs = [...(cursor?.logs ?? []), ...settled];
  cache.snapshotSent.set(cacheKey, { scannedTo, logs });
  return [...logs, ...unsettled].sort(bySendOrder);
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

/**
 * Fetches the claim resolve state: whether one of our own `sendSnapshot` transactions carrying
 * the current claim struct is in flight, and whether its L2 -> L1 message is ready to execute.
 *
 * Only our signer's sends count. `sendSnapshot` is permissionless and cheap, so following
 * anyone else's ticket lets a third party stall the dispute with junk; sending our own costs
 * one Arbitrum transaction per dispute. A send whose struct no longer hashes to
 * `claimHashes[E]` (the claim changed after it) is not followed, so the caller re-sends.
 * `claimHashes` is read at the outbox chain's read block, the message status on `l1Provider`.
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

  let snapshotSents: SnapshotSentRef[];
  try {
    snapshotSents = await findSnapshotSents({ veaInbox, veaInboxProvider, epoch, epochPeriod, cacheKey, cache });
  } catch {
    // The indexer knows only one `SnapshotSent` per epoch; the final logs found so far still count.
    const sentSnapshotFromGraph = await fetchSnapshotSentFromGraph(epoch, inboxAddress, chainId);
    snapshotSents = [...(cache.snapshotSent.get(cacheKey)?.logs ?? [])];
    if (sentSnapshotFromGraph && !snapshotSents.some((log) => log.transactionHash === sentSnapshotFromGraph.txHash)) {
      snapshotSents.push({ transactionHash: sentSnapshotFromGraph.txHash, blockNumber: Infinity, index: 0 });
    }
  }

  for (const sent of snapshotSents) {
    const facts = await getOwnSendFacts({
      transactionHash: sent.transactionHash,
      veaInbox,
      inboxAddress,
      signerAddress,
      veaInboxProvider,
      cache,
    });
    if (facts?.claimHash.toLowerCase() !== claimHash.toLowerCase()) continue;
    claimResolveState.sendSnapshot = { status: true, txHash: sent.transactionHash };
    break;
  }
  if (!claimResolveState.sendSnapshot.status) return claimResolveState;

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

export { getClaim, hashClaim, verifyClaimHash, getClaimResolveState, ClaimHonestState, ClaimResolveState };
