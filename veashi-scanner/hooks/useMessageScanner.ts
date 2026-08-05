import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { createPublicClient, http, Address } from "viem";
import { NO_CHAIN, ChainFilter, BlockRange, Network } from "@/lib/types";
import { getMessageDispatchedLogs } from "@/lib/hashi";
import { getYaho, getAllSourceChains, getDestinationChains } from "@kleros/veashi-sdk";
import type { Message } from "@/lib/types";
import {
  getCache,
  getCachedMessages,
  getUncachedSubranges,
  mergeRanges,
  messageKey,
  updateCache,
  type ScannedRange,
} from "@/lib/scannerCache";
import { getViemChain, getRpcUrl, matchesNetwork } from "@/lib/chains";
import { fetchMessagesFromEnvio } from "@/lib/envioClient";

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const SCAN_WINDOW_BLOCKS = BigInt(1_000_000);
const CHUNK_SIZE = BigInt(10_000);

/** How often to re-scan for newly-dispatched messages without a user-triggered filter change. */
const POLL_INTERVAL_MS = 15_000;

/**
 * Per-route soft cap on newly-fetched (non-cached) messages we'll add to the
 * displayed list before stopping further chunked scans for that route.
 * Cached results are not counted against this cap.
 */
const MAX_NEW_MESSAGES_PER_ROUTE = 10;

/** Normalize a tx hash for cross-provider comparison. */
function normalizeHash(hash: string): string {
  return hash.toLowerCase();
}

/**
 * Merge a batch of new messages into existing state, deduplicating by
 * messageKey (messageId or txHash:nonce fallback) and keeping the result
 * sorted newest-first.
 */
function compareMessages(a: Message, b: Message): number {
  // Prefer blockTimestamp for cross-chain accuracy; fall back to blockNumber.
  const ta = a.blockTimestamp ?? a.blockNumber;
  const tb = b.blockTimestamp ?? b.blockNumber;
  return tb - ta;
}

function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map(messageKey));
  const fresh = incoming.filter((m) => !seen.has(messageKey(m)));
  if (fresh.length === 0) return prev;
  return [...prev, ...fresh].sort(compareMessages);
}

/** Resolve which destination chain(s) to target for a given source chain. */
function resolveTargetDestIds(destinationChain: ChainFilter, supportedDestinations: number[]): number[] {
  if (destinationChain === NO_CHAIN) {
    return supportedDestinations;
  }
  if (supportedDestinations.includes(destinationChain as number)) {
    return [destinationChain as number];
  }
  return [];
}

/** Narrow a list of chain IDs to just mainnet or just testnet chains. Undefined network = no filtering. */
function filterByNetwork(chainIds: number[], network: Network | undefined): number[] {
  if (!network) return chainIds;
  return chainIds.filter((id) => matchesNetwork(id, network));
}

/**
 * Load all cached messages for the given chain filter synchronously from
 * localStorage.  Returns them sorted newest-first.
 */
function loadAllCachedMessages(
  sourceChain: ChainFilter,
  destinationChain: ChainFilter,
  network: Network | undefined
): Message[] {
  const chainsToScan =
    sourceChain === NO_CHAIN ? filterByNetwork(getAllSourceChains(), network) : [sourceChain as number];

  const all: Message[] = [];
  for (const srcId of chainsToScan) {
    const supportedDestinations = getDestinationChains(srcId);
    const targetDestIds = resolveTargetDestIds(destinationChain, supportedDestinations);

    for (const dstId of targetDestIds) {
      all.push(...getCachedMessages(srcId, dstId));
    }
  }

  return all.sort(compareMessages);
}

// ─── Scanning: RPC fallback / cache backfill ─────────────────────────────────

/** Fetch one chunk of raw logs, format them, cache them, and display any that fall in range. */
async function processChunk(
  signal: AbortSignal,
  yahoAddr: Address,
  srcId: number,
  dstId: number,
  chunkStart: bigint,
  chunkEnd: bigint,
  displayRange: ScannedRange,
  remainingBudget: number,
  setMessages: Dispatch<SetStateAction<Message[]>>
): Promise<number> {
  const rawLogs = await getMessageDispatchedLogs(yahoAddr, chunkStart, chunkEnd, srcId);
  if (signal.aborted) return 0;

  const chunkRange: ScannedRange = { start: Number(chunkStart), end: Number(chunkEnd) };
  const formatted: Message[] = rawLogs.map((log) => ({
    txHash: normalizeHash(log.txHash),
    sourceChain: srcId,
    destinationChain: log.message.targetChainId,
    thresholdRequired: log.message.threshold,
    thresholdCurrent: 0,
    sourceAddress: log.message.sender,
    destinationAddress: log.message.receiver,
    blockNumber: log.blockNumber,
    blockTimestamp: log.blockTimestamp,
    messageId: log.messageId,
    adapters: log.message.adapters,
    reporters: log.message.reporters,
    nonce: log.message.nonce,
    data: log.message.data,
  }));

  const logsForDst = formatted.filter((m) => m.destinationChain === dstId);
  updateCache(srcId, dstId, chunkRange, logsForDst);

  const logsToDisplay = logsForDst.filter(
    (m) => m.blockNumber >= displayRange.start && m.blockNumber <= displayRange.end
  );
  if (logsToDisplay.length === 0) return 0;

  // Newest-first, matching the newest-first chunk walk in `backfillSubrange`,
  // so a truncated budget keeps the most recent messages.
  const toAdd = [...logsToDisplay].sort((a, b) => b.blockNumber - a.blockNumber).slice(0, Math.max(0, remainingBudget));
  if (toAdd.length === 0) return 0;

  setMessages((prev) => mergeMessages(prev, toAdd));
  return toAdd.length;
}

/** Chunk backwards through one uncached subrange until it's exhausted, the budget runs out, or aborted. */
async function backfillSubrange(
  signal: AbortSignal,
  yahoAddr: Address,
  srcId: number,
  dstId: number,
  subrange: ScannedRange,
  displayRange: ScannedRange,
  remainingBudget: number,
  setMessages: Dispatch<SetStateAction<Message[]>>
): Promise<number> {
  let chunkEnd = BigInt(subrange.end);
  const subStart = BigInt(subrange.start);
  let added = 0;

  while (chunkEnd >= subStart && added < remainingBudget && !signal.aborted) {
    let chunkStart = chunkEnd - CHUNK_SIZE + BigInt(1);
    if (chunkStart < subStart) chunkStart = subStart;

    added += await processChunk(
      signal,
      yahoAddr,
      srcId,
      dstId,
      chunkStart,
      chunkEnd,
      displayRange,
      remainingBudget - added,
      setMessages
    );
    if (signal.aborted) break;

    chunkEnd = chunkStart - BigInt(1);
    await new Promise((r) => setTimeout(r, 500));
  }

  return added;
}

/** Backfill one dst route: chunk through its uncached subranges, newest first, up to the per-route cap. */
async function backfillRoute(
  srcId: number,
  dstId: number,
  scanRange: ScannedRange,
  displayRange: ScannedRange,
  signal: AbortSignal,
  setMessages: Dispatch<SetStateAction<Message[]>>
): Promise<void> {
  if (signal.aborted) return;

  const yahoAddr = getYaho(srcId, dstId);
  if (!yahoAddr) return;

  const cacheEntry = getCache(srcId, dstId);
  const mergedUncached = mergeRanges(getUncachedSubranges(scanRange, cacheEntry?.scannedRanges ?? []));
  if (mergedUncached.length === 0) return;

  const rangesNewestFirst = [...mergedUncached].sort((a, b) => b.end - a.end);

  let newAddedForRoute = 0;
  for (const subrange of rangesNewestFirst) {
    if (signal.aborted || newAddedForRoute >= MAX_NEW_MESSAGES_PER_ROUTE) break;

    newAddedForRoute += await backfillSubrange(
      signal,
      yahoAddr as Address,
      srcId,
      dstId,
      subrange,
      displayRange,
      MAX_NEW_MESSAGES_PER_ROUTE - newAddedForRoute,
      setMessages
    );
  }
}

/**
 * RPC fallback / cache backfill for one source chain: backfills every dst
 * route in turn. Runs after the envio fast path so it never gates isScanning.
 */
async function backfillRoutes(
  srcId: number,
  targets: { dstId: number; scanRange: ScannedRange }[],
  displayRange: ScannedRange,
  signal: AbortSignal,
  setMessages: Dispatch<SetStateAction<Message[]>>
): Promise<void> {
  for (const { dstId, scanRange } of targets) {
    if (signal.aborted) break;
    await backfillRoute(srcId, dstId, scanRange, displayRange, signal, setMessages);
  }
}

/**
 * Start a source chain's RPC backfill unless one is already running for that
 * srcId. A backfill run can easily outlive POLL_INTERVAL_MS (chunking sleeps
 * 500ms per chunk), so without this guard each poll tick would stack another
 * overlapping run on top, duplicating RPC queries and cache writes for the
 * same subranges.
 */
function startBackfillIfIdle(
  activeBackfills: Map<number, Promise<void>>,
  srcId: number,
  targets: { dstId: number; scanRange: ScannedRange }[],
  displayRange: ScannedRange,
  signal: AbortSignal,
  setMessages: Dispatch<SetStateAction<Message[]>>
): void {
  if (activeBackfills.has(srcId)) return;

  const run = backfillRoutes(srcId, targets, displayRange, signal, setMessages)
    .catch((err) => {
      // RPC failures during chunked backfill are expected. Log and let the
      // next poll tick retry the still-uncached subranges.
      console.error(`RPC backfill failed for chain ${srcId}:`, err);
    })
    .finally(() => {
      activeBackfills.delete(srcId);
    });
  activeBackfills.set(srcId, run);
}

// ─── Scanning: envio fast path ───────────────────────────────────────────────

/**
 * Envio fast path for one dst, independent of any RPC call so a slow/failing
 * source-chain RPC never blocks indexed results from displaying. Returns
 * whether this dst has a Yaho deployment and should also be RPC-backfilled.
 */
async function fetchEnvioFastPath(
  srcId: number,
  dstId: number,
  displayRange: ScannedRange,
  signal: AbortSignal,
  setMessages: Dispatch<SetStateAction<Message[]>>
): Promise<boolean> {
  const envioMessages = await fetchMessagesFromEnvio({ sourceChainId: srcId, destinationChainId: dstId, limit: 10 });
  if (signal.aborted) return false;

  if (envioMessages !== null) {
    const inRange = envioMessages.filter(
      (m) => m.blockNumber >= displayRange.start && m.blockNumber <= displayRange.end
    );
    if (inRange.length > 0) {
      setMessages((prev) => mergeMessages(prev, inRange));
    }
  }

  return Boolean(getYaho(srcId, dstId));
}

/** Run the envio fast path across every target dst, collecting which ones also need RPC backfill. */
async function runEnvioFastPath(
  srcId: number,
  targetDestIds: number[],
  displayRange: ScannedRange,
  signal: AbortSignal,
  setMessages: Dispatch<SetStateAction<Message[]>>
): Promise<number[]> {
  const backfillDstIds: number[] = [];

  for (const dstId of targetDestIds) {
    if (signal.aborted) break;

    const needsBackfill = await fetchEnvioFastPath(srcId, dstId, displayRange, signal, setMessages);
    if (needsBackfill) backfillDstIds.push(dstId);
  }

  return backfillDstIds;
}

// ─── Scanning: RPC scan range ────────────────────────────────────────────────

/** Pick the scan window's start block: explicit fromBlock, else a fixed window before endBlock. */
function computeStartBlock(fromBlock: number | undefined, endBlock: bigint): bigint {
  if (fromBlock !== undefined) return BigInt(fromBlock);
  if (endBlock - SCAN_WINDOW_BLOCKS > BigInt(0)) return endBlock - SCAN_WINDOW_BLOCKS;
  return BigInt(1);
}

/** Compute the RPC scan range for a source chain. Returns null if aborted or the range is invalid. */
async function computeScanRange(
  srcId: number,
  fromBlock: number | undefined,
  toBlock: number | undefined,
  chainConfig: NonNullable<ReturnType<typeof getViemChain>>,
  signal: AbortSignal
): Promise<ScannedRange | null> {
  try {
    const publicClient = createPublicClient({
      chain: chainConfig,
      transport: http(getRpcUrl(srcId)),
    });

    let startBlock: bigint;
    let endBlock: bigint;

    if (fromBlock !== undefined && toBlock !== undefined) {
      startBlock = BigInt(fromBlock);
      endBlock = BigInt(toBlock);
    } else {
      const currentBlock = await publicClient.getBlockNumber();
      if (signal.aborted) return null;

      endBlock = toBlock !== undefined ? BigInt(toBlock) : currentBlock;
      startBlock = computeStartBlock(fromBlock, endBlock);
    }

    if (signal.aborted) return null;

    if (endBlock < startBlock) {
      console.warn(`Invalid block range for chain ${srcId}: ${startBlock}-${endBlock}`);
      return null;
    }

    return { start: Number(startBlock), end: Number(endBlock) };
  } catch (err) {
    console.error(`Failed to determine RPC scan range for chain ${srcId}:`, err);
    return null;
  }
}

// ─── Scanning: per-chain orchestration ───────────────────────────────────────

/** Scan a single source chain: envio fast path, then RPC fallback / cache backfill. */
async function scanSourceChain(
  srcId: number,
  destinationChain: ChainFilter,
  fromBlock: number | undefined,
  toBlock: number | undefined,
  displayRange: ScannedRange,
  signal: AbortSignal,
  isSingleChain: boolean,
  activeBackfills: Map<number, Promise<void>>,
  setMessages: Dispatch<SetStateAction<Message[]>>,
  setBlockRange: Dispatch<SetStateAction<BlockRange | null>>
): Promise<void> {
  if (signal.aborted) return;

  try {
    const chainConfig = getViemChain(srcId);
    if (!chainConfig) {
      console.warn(`Unsupported source chain ${srcId}`);
      return;
    }

    const supportedDestinations = getDestinationChains(srcId);
    const targetDestIds = resolveTargetDestIds(destinationChain, supportedDestinations);
    if (targetDestIds.length === 0) return;

    const backfillDstIds = await runEnvioFastPath(srcId, targetDestIds, displayRange, signal, setMessages);
    if (signal.aborted || backfillDstIds.length === 0) return;

    const scanRange = await computeScanRange(srcId, fromBlock, toBlock, chainConfig, signal);
    if (!scanRange) return;

    if (isSingleChain) {
      setBlockRange({
        chain: chainConfig.name,
        start: scanRange.start,
        end: scanRange.end,
        windowSize: scanRange.end - scanRange.start,
      });
    } else {
      setBlockRange(null);
    }

    const backfillTargets: { dstId: number; scanRange: ScannedRange }[] = backfillDstIds.map((dstId) => ({
      dstId,
      scanRange,
    }));

    // RPC fallback / cache backfill: runs after the fast path so it
    // never gates isScanning, but keeps filling the cache and
    // trickling in any messages Envio missed. Skipped if a backfill for
    // this srcId is still running from a previous poll tick.
    startBackfillIfIdle(activeBackfills, srcId, backfillTargets, displayRange, signal, setMessages);
  } catch (err) {
    console.error(`Scanning failed for chain ${srcId}:`, err);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMessageScanner(
  sourceChain: ChainFilter,
  destinationChain: ChainFilter,
  fromBlock?: number,
  toBlock?: number,
  network?: Network
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [blockRange, setBlockRange] = useState<BlockRange | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (sourceChain !== NO_CHAIN && destinationChain !== NO_CHAIN && sourceChain === destinationChain) {
      setMessages([]);
      setIsScanning(false);
      return;
    }

    // Abort any in-progress scan immediately.
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // Show cached messages synchronously, before any RPC call
    const cached = loadAllCachedMessages(sourceChain, destinationChain, network);
    setMessages(cached);

    // Scan for uncached blocks asynchronously
    setIsScanning(true);
    setError(null);
    setBlockRange(null);

    const chainsToScan =
      sourceChain === NO_CHAIN ? filterByNetwork(getAllSourceChains(), network) : [sourceChain as number];

    // displayRange filters newly-fetched logs before rendering them.
    // Cached messages are always shown regardless of this range.
    const displayRange: ScannedRange = {
      start: fromBlock ?? 0,
      end: toBlock ?? Number.MAX_SAFE_INTEGER,
    };

    // Tracks in-flight backfill runs by srcId across poll ticks so a slow
    // backfill (can outlive POLL_INTERVAL_MS) isn't duplicated by the next tick.
    const activeBackfills = new Map<number, Promise<void>>();

    const scan = async () => {
      try {
        const scanPromises = chainsToScan.map((srcId) =>
          scanSourceChain(
            srcId,
            destinationChain,
            fromBlock,
            toBlock,
            displayRange,
            signal,
            chainsToScan.length === 1,
            activeBackfills,
            setMessages,
            setBlockRange
          )
        );

        await Promise.all(scanPromises);
      } catch (err) {
        console.error("Global scanning failed:", err);
        setError("Failed to scan blockchain.");
      } finally {
        if (!signal.aborted) setIsScanning(false);
      }
    };

    scan();
    const pollId = setInterval(() => {
      if (!signal.aborted) void scan();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollId);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [sourceChain, destinationChain, fromBlock, toBlock, network]);

  return { messages, isScanning, blockRange, error };
}
