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
 * several challengers then exist and the stored claim names one of them (BR-9). Tried newest
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
   * Frozen interface (validator-v1-fixes seed): set when the outbox emitted `FailedResolution`
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
 * cycles only scan the blocks added since (PRD 4.10). Logs above `scannedTo` can still be
 * reorged out and are re-read every cycle.
 */
interface SnapshotSentCursor {
  scannedTo: number;
  logs: SnapshotSentRef[];
}

/**
 * What a `SnapshotSent` transaction's receipt says about the L2 -> L1 message the bot would
 * execute: the decoded epoch, the AMB gas limit (10200 only) and the hash of the claim struct.
 * Null when its first message is not a valid ticket for this route. Receipts are immutable, so
 * this never changes; whether the ticket is adopted is decided against `claimHashes` per call.
 */
type TicketFacts = { epoch: bigint; gasLimit: bigint | null; claimHash: string } | null;

export interface ClaimResolveCache {
  snapshotSent: Map<string, SnapshotSentCursor>;
  tickets: Map<string, TicketFacts>;
}

export const createClaimResolveCache = (): ClaimResolveCache => ({
  snapshotSent: new Map(),
  tickets: new Map(),
});

// Production passes no cache: this one lives, unbounded, for the whole process.
const defaultClaimResolveCache = createClaimResolveCache();

export interface ClaimResolveStateParams {
  chainId: number;
  network?: string;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutbox: any;
  /** The provider of the outbox's own chain. Every outbox read is pinned to its read block. */
  veaOutboxProvider: JsonRpcProvider;
  /**
   * Frozen interface (validator-v1-fixes seed): the provider of Arbitrum's L1 (Ethereum; on
   * chain 10200 the Sepolia router provider), used for the L2 -> L1 message status. When
   * omitted, `veaOutboxProvider` is used, which is correct only when the outbox chain is L1.
   */
  l1Provider?: JsonRpcProvider;
  epoch: number;
  epochPeriod: number;
  /** Ignored: the `SnapshotSent` lookup always reaches the inbox `latest` block ([L28] (b)). */
  headBlockTag?: "latest" | "finalized";
  emitter?: typeof defaultEmitter;
  fetchMessageStatus?: typeof getMessageStatus;
  fetchSnapshotSentFromGraph?: typeof getSnapshotSentForEpoch;
  cache?: ClaimResolveCache;
}

const logIndexOf = (log: any): number => log.index ?? log.logIndex ?? 0;

const bySendOrder = (a: SnapshotSentRef, b: SnapshotSentRef): number =>
  a.blockNumber - b.blockNumber || a.index - b.index;

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

const ARB_SYS_ADDRESS = "0x0000000000000000000000000000000000000064";
const arbSysInterface = new ethers.Interface([
  "event L2ToL1Tx(address caller, address indexed destination, uint256 indexed hash, uint256 indexed position, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, bytes data)",
  "event L2ToL1Transaction(address caller, address indexed destination, uint256 indexed uniqueId, uint256 indexed batchNumber, uint256 indexInBatch, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, bytes data)",
]);
const L2_TO_L1_TX_TOPIC = arbSysInterface.getEvent("L2ToL1Tx")!.topicHash;
const L2_TO_L1_TRANSACTION_TOPIC = arbSysInterface.getEvent("L2ToL1Transaction")!.topicHash;

const CLAIM_TUPLE =
  "(bytes32 stateRoot, address claimer, uint32 timestampClaimed, uint32 timestampVerification, uint32 blocknumberVerification, uint8 honest, address challenger)";
/** The call each route's inbox forwards to L1: `resolveDisputedClaim` on the outbox, `route` on the router. */
const ticketCalls: { [chainId: number]: ethers.Interface } = {
  11155111: new ethers.Interface([
    `function resolveDisputedClaim(uint256 _epoch, bytes32 _stateRoot, ${CLAIM_TUPLE} _claim)`,
  ]),
  10200: new ethers.Interface([
    `function route(uint256 _epoch, bytes32 _stateRoot, uint256 _gasLimit, ${CLAIM_TUPLE} _claim)`,
  ]),
};

/** The AMB gas the bot itself sends with on 10200 (`arbToGnosisHandler.ts`); less may fail on Gnosis. */
const MIN_ROUTE_GAS_LIMIT = BigInt(3_000_000);

/**
 * Decode the ticket a receipt carries. Only the first L2 -> L1 message counts, in the order the
 * Arbitrum SDK lists them (classic `L2ToL1Transaction` logs before `L2ToL1Tx`), because that is
 * the message `getMessageStatus` and `messageExecutor` act on. It must be an `L2ToL1Tx` emitted
 * by ArbSys with the inbox as caller; ArbSys then guarantees the inbox's immutable destination.
 */
const decodeTicket = (logs: readonly any[], chainId: number, inboxAddress: string): TicketFacts => {
  const call = ticketCalls[chainId];
  if (!call) return null;
  const topicOf = (log: any) => log?.topics?.[0];
  const first =
    logs.find((log) => topicOf(log) === L2_TO_L1_TRANSACTION_TOPIC) ??
    logs.find((log) => topicOf(log) === L2_TO_L1_TX_TOPIC);
  if (!first || topicOf(first) !== L2_TO_L1_TX_TOPIC) return null;
  if (String(first.address).toLowerCase() !== ARB_SYS_ADDRESS) return null;
  try {
    const message = arbSysInterface.parseLog({ topics: first.topics, data: first.data });
    if (!message || String(message.args.caller).toLowerCase() !== inboxAddress.toLowerCase()) return null;
    const parsed = call.parseTransaction({ data: message.args.data });
    if (!parsed) return null;
    return {
      epoch: BigInt(parsed.args._epoch),
      gasLimit: chainId === 10200 ? BigInt(parsed.args._gasLimit) : null,
      claimHash: hashClaim(parsed.args._claim as unknown as ClaimStruct),
    };
  } catch {
    return null;
  }
};

/**
 * The ticket facts of one `SnapshotSent` transaction, fetching its receipt at most once per
 * process. A missing receipt (a lagging endpoint) is not cached: the ticket stays unknown for
 * this call and is tried again next cycle.
 */
const getTicketFacts = async ({
  transactionHash,
  chainId,
  inboxAddress,
  veaInboxProvider,
  cache,
}: {
  transactionHash: string;
  chainId: number;
  inboxAddress: string;
  veaInboxProvider: JsonRpcProvider;
  cache: ClaimResolveCache;
}): Promise<TicketFacts | undefined> => {
  const key = `${chainId}_${inboxAddress.toLowerCase()}_${transactionHash.toLowerCase()}`;
  if (cache.tickets.has(key)) return cache.tickets.get(key) ?? null;
  const receipt: any = await veaInboxProvider.getTransactionReceipt(transactionHash);
  if (!receipt) return undefined;
  const facts = receipt.status === 0 ? null : decodeTicket(receipt.logs ?? [], chainId, inboxAddress);
  cache.tickets.set(key, facts);
  return facts;
};

const isAdoptable = (facts: TicketFacts, epoch: number, claimHash: string): boolean =>
  facts !== null &&
  facts.epoch === BigInt(epoch) &&
  (facts.gasLimit === null || facts.gasLimit >= MIN_ROUTE_GAS_LIMIT) &&
  facts.claimHash === claimHash;

/**
 * Fetches the claim resolve state: the earliest `SnapshotSent` ticket for the epoch whose L2 -> L1
 * message would resolve the current claim, and that message's status on L1.
 *
 * `sendSnapshot` is permissionless, so a ticket is adopted only on what its receipt proves (see
 * `decodeTicket`): its first L2 -> L1 message is the inbox's own, for this epoch, carrying a
 * struct that hashes to `claimHashes[epoch]` at the outbox read block (and, on 10200, enough
 * AMB gas). A ticket that cannot resolve the claim is never adopted, so `failedResolution` is
 * never set: when no ticket qualifies, `sendSnapshot.status` is false and the snapshot is re-sent.
 *
 * Reads are pinned per chain: `SnapshotSent` on the inbox chain up to its `latest` block,
 * `claimHashes` at the outbox chain's read block, and the message status on `l1Provider`.
 *
 * @returns ClaimResolveState
 **/
const getClaimResolveState = async ({
  chainId,
  veaInbox,
  veaInboxProvider,
  veaOutbox,
  veaOutboxProvider,
  l1Provider,
  epoch,
  epochPeriod,
  emitter = defaultEmitter,
  fetchMessageStatus = getMessageStatus,
  fetchSnapshotSentFromGraph = getSnapshotSentForEpoch,
  cache = defaultClaimResolveCache,
}: ClaimResolveStateParams): Promise<ClaimResolveState> => {
  let claimResolveState: ClaimResolveState = {
    sendSnapshot: {
      status: false,
      txHash: "",
    },
    execution: {
      status: 0,
      txHash: "",
    },
  };
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
    const facts = await getTicketFacts({
      transactionHash: sent.transactionHash,
      chainId,
      inboxAddress,
      veaInboxProvider,
      cache,
    });
    if (facts === undefined || !isAdoptable(facts, epoch, claimHash)) continue;
    claimResolveState.sendSnapshot.status = true;
    claimResolveState.sendSnapshot.txHash = sent.transactionHash;
    break;
  }
  if (!claimResolveState.sendSnapshot.status) return claimResolveState;

  const status = await fetchMessageStatus(
    claimResolveState.sendSnapshot.txHash,
    veaInboxProvider,
    l1Provider ?? veaOutboxProvider
  );
  claimResolveState.execution.status = status;

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
