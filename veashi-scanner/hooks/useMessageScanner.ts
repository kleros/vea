import { useState, useEffect, useRef } from "react";
import { createPublicClient, http, Address } from "viem";
import { NO_CHAIN, ChainFilter, BlockRange } from "@/lib/types";
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
import { getViemChain } from "@/lib/chains";
import { fetchMessagesFromEnvio } from "@/lib/envioClient";

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const SCAN_WINDOW_BLOCKS = BigInt(1_000_000);
const CHUNK_SIZE = BigInt(10_000);

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

/**
 * Load all cached messages for the given chain filter synchronously from
 * localStorage.  Returns them sorted newest-first.
 */
function loadAllCachedMessages(sourceChain: ChainFilter, destinationChain: ChainFilter): Message[] {
  const chainsToScan = sourceChain === NO_CHAIN ? getAllSourceChains() : [sourceChain as number];

  const all: Message[] = [];
  for (const srcId of chainsToScan) {
    const supportedDestinations = getDestinationChains(srcId);
    const targetDestIds =
      destinationChain === NO_CHAIN
        ? supportedDestinations
        : supportedDestinations.includes(destinationChain as number)
        ? [destinationChain as number]
        : [];

    for (const dstId of targetDestIds) {
      all.push(...getCachedMessages(srcId, dstId));
    }
  }

  return all.sort(compareMessages);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMessageScanner(
  sourceChain: ChainFilter,
  destinationChain: ChainFilter,
  fromBlock?: number,
  toBlock?: number
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
    const cached = loadAllCachedMessages(sourceChain, destinationChain);
    setMessages(cached);

    // Scan for uncached blocks asynchronously
    setIsScanning(true);
    setError(null);

    const chainsToScan = sourceChain === NO_CHAIN ? getAllSourceChains() : [sourceChain as number];

    // displayRange filters newly-fetched logs before rendering them.
    // Cached messages are always shown regardless of this range.
    const displayRange: ScannedRange = {
      start: fromBlock ?? 0,
      end: toBlock ?? Number.MAX_SAFE_INTEGER,
    };

    const scan = async () => {
      try {
        const scanPromises = chainsToScan.map(async (srcId) => {
          if (signal.aborted) return;

          try {
            const chainConfig = getViemChain(srcId);
            if (!chainConfig) {
              console.warn(`Unsupported source chain ${srcId}`);
              return;
            }

            const supportedDestinations = getDestinationChains(srcId);
            const targetDestIds =
              destinationChain === NO_CHAIN
                ? supportedDestinations
                : supportedDestinations.includes(destinationChain as number)
                ? [destinationChain as number]
                : [];

            if (targetDestIds.length === 0) return;

            const publicClient = createPublicClient({
              chain: chainConfig,
              transport: http(),
            });

            // ── Determine the scan range (what to fetch from RPC) ───────────
            let startBlock: bigint;
            let endBlock: bigint;

            if (fromBlock !== undefined && toBlock !== undefined) {
              startBlock = BigInt(fromBlock);
              endBlock = BigInt(toBlock);
            } else {
              const currentBlock = await publicClient.getBlockNumber();
              if (signal.aborted) return;

              endBlock = toBlock !== undefined ? BigInt(toBlock) : currentBlock;
              startBlock =
                fromBlock !== undefined
                  ? BigInt(fromBlock)
                  : endBlock - SCAN_WINDOW_BLOCKS > BigInt(0)
                  ? endBlock - SCAN_WINDOW_BLOCKS
                  : BigInt(1);
            }

            if (signal.aborted) return;

            if (endBlock < startBlock) {
              console.warn(`Invalid block range for chain ${srcId}: ${startBlock}-${endBlock}`);
              return;
            }

            const scanRange: ScannedRange = {
              start: Number(startBlock),
              end: Number(endBlock),
            };

            if (chainsToScan.length === 1) {
              setBlockRange({
                chain: chainConfig.name,
                start: scanRange.start,
                end: scanRange.end,
                windowSize: scanRange.end - scanRange.start,
              });
            } else {
              setBlockRange(null);
            }

            for (const dstId of targetDestIds) {
              if (signal.aborted) break;

              // envio indexer
              const envioMessages = await fetchMessagesFromEnvio({
                sourceChainId: srcId,
                destinationChainId: dstId,
                limit: 10,
              });
              if (signal.aborted) break;

              if (envioMessages !== null) {
                const inRange = envioMessages.filter(
                  (m) => m.blockNumber >= displayRange.start && m.blockNumber <= displayRange.end
                );
                if (inRange.length > 0) {
                  setMessages((prev) => mergeMessages(prev, inRange));
                }
              }

              // RPC fallback
              const yahoAddr = getYaho(srcId, dstId);
              if (!yahoAddr) continue;

              const cacheEntry = getCache(srcId, dstId);
              const mergedUncached = mergeRanges(getUncachedSubranges(scanRange, cacheEntry?.scannedRanges ?? []));
              if (mergedUncached.length === 0) continue;

              const targetDestSet = new Set([dstId]);
              const rangesNewestFirst = [...mergedUncached].sort((a, b) => b.end - a.end);
              let newAddedForRoute = 0;

              outer: for (const subrange of rangesNewestFirst) {
                let chunkEnd = BigInt(subrange.end);
                const subStart = BigInt(subrange.start);

                while (chunkEnd >= subStart) {
                  if (signal.aborted) break outer;

                  let chunkStart = chunkEnd - CHUNK_SIZE + BigInt(1);
                  if (chunkStart < subStart) chunkStart = subStart;

                  const chunkRange: ScannedRange = {
                    start: Number(chunkStart),
                    end: Number(chunkEnd),
                  };

                  const rawLogs = await getMessageDispatchedLogs(yahoAddr as Address, chunkStart, chunkEnd, srcId);

                  if (signal.aborted) break outer;

                  const formatted: Message[] = rawLogs.map((log) => ({
                    txHash: normalizeHash(log.txHash),
                    sourceChain: srcId,
                    destinationChain: log.message.targetChainId,
                    thresholdRequired: log.message.threshold,
                    thresholdCurrent: 0,
                    sourceAddress: log.message.sender,
                    destinationAddress: log.message.receiver,
                    blockNumber: log.blockNumber,
                    messageId: log.messageId,
                    adapters: log.message.adapters,
                    reporters: log.message.reporters,
                    nonce: log.message.nonce,
                  }));

                  const logsForDst = formatted.filter((m) => m.destinationChain === dstId);
                  updateCache(srcId, dstId, chunkRange, logsForDst);

                  const logsToDisplay = formatted.filter(
                    (m) =>
                      targetDestSet.has(m.destinationChain) &&
                      m.blockNumber >= displayRange.start &&
                      m.blockNumber <= displayRange.end
                  );

                  if (logsToDisplay.length > 0) {
                    const remaining = MAX_NEW_MESSAGES_PER_ROUTE - newAddedForRoute;
                    const toAdd = logsToDisplay.slice(0, Math.max(0, remaining));
                    if (toAdd.length > 0) {
                      setMessages((prev) => mergeMessages(prev, toAdd));
                      newAddedForRoute += toAdd.length;
                    }
                  }

                  if (newAddedForRoute >= MAX_NEW_MESSAGES_PER_ROUTE) break outer;

                  chunkEnd = chunkStart - BigInt(1);
                  await new Promise((r) => setTimeout(r, 500));
                }
              }
            }
          } catch (err) {
            console.error(`Scanning failed for chain ${srcId}:`, err);
          }
        });

        await Promise.all(scanPromises);
      } catch (err) {
        console.error("Global scanning failed:", err);
        setError("Failed to scan blockchain.");
      } finally {
        if (!signal.aborted) setIsScanning(false);
      }
    };

    scan();

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [sourceChain, destinationChain, fromBlock, toBlock]);

  return { messages, isScanning, blockRange, error };
}
