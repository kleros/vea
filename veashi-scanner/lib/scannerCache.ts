/**
 * Local cache for blockchain scan results.
 *
 * Keyed by (sourceChainId, destChainId).  Persists to localStorage so results
 * survive page reloads.  Tracks exactly which block ranges have been scanned
 * so the scanner can skip them on subsequent runs.
 *
 * Invariant: for every block in `scannedRanges`, the cache contains every
 * matching message that was ever found there.  This means eviction must drop
 * scanned-range coverage alongside the messages, never silently.
 */

import type { Message } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScannedRange {
  start: number;
  end: number;
}

interface CacheEntry {
  version: number;
  scannedRanges: ScannedRange[];
  messages: Message[];
  lastUpdated: number; // unix ms
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_PREFIX = "veashi_v1_";
const CACHE_VERSION = 2; // bumped: dedup is now by messageId instead of txHash

/**
 * Cap on how many messages to retain per chain pair.
 * Oldest (lowest blockNumber) are evicted first, and `scannedRanges`
 * is clamped to match so we don't claim coverage for blocks we've thrown away.
 */
const MAX_CACHED_MESSAGES = 500;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Normalize a tx hash for cross-provider comparison. */
function normalizeHash(hash: string): string {
  return hash.toLowerCase();
}

/**
 * Stable unique key for a Hashi message.
 *
 * A single transaction can emit multiple MessageDispatched events (e.g. batch
 * dispatches or contracts that call dispatchMessage more than once), so
 * `txHash` alone is NOT unique.  Prefer Hashi's `messageId`.  Fall back to
 * `txHash:nonce` for legacy cache entries that predate this fix.
 */
export function messageKey(m: Message): string {
  if (m.messageId) return m.messageId.toLowerCase();
  return `${normalizeHash(m.txHash)}:${m.nonce ?? 0}`;
}

let storageWarningEmitted = false;
function warnStorageOnce(err: unknown): void {
  if (storageWarningEmitted) return;
  storageWarningEmitted = true;
  console.warn("[cache] localStorage write failed; cache disabled:", err);
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function storageKey(srcId: number, dstId: number): string {
  return `${CACHE_PREFIX}${srcId}_${dstId}`;
}

export function getCache(srcId: number, dstId: number): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(srcId, dstId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    // Drop entries from older schema versions rather than risk half-valid data.
    if (parsed.version !== CACHE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCache(srcId: number, dstId: number, entry: CacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(srcId, dstId), JSON.stringify(entry));
  } catch (err) {
    // Storage full or unavailable — surface once so silent failures aren't invisible.
    warnStorageOnce(err);
  }
}

export function clearCache(srcId: number, dstId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(srcId, dstId));
  } catch {
    /* ignore */
  }
}

// ─── Range utilities ──────────────────────────────────────────────────────────

/**
 * Merge overlapping / adjacent ranges and return them sorted ascending by start.
 */
export function mergeRanges(ranges: ScannedRange[]): ScannedRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: ScannedRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= last.end + 1) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

/**
 * Clamp `ranges` so nothing extends below `minBlock`.  Used after eviction:
 * if we no longer hold messages from blocks < minBlock, we must not claim
 * those blocks were scanned.
 */
function clampRangesAbove(ranges: ScannedRange[], minBlock: number): ScannedRange[] {
  const out: ScannedRange[] = [];
  for (const r of ranges) {
    if (r.end < minBlock) continue;
    out.push({ start: Math.max(r.start, minBlock), end: r.end });
  }
  return out;
}

/**
 * Return the sub-ranges of `desired` not yet covered by `cached`.
 * These are the block intervals that still need to be fetched from the chain.
 */
export function getUncachedSubranges(desired: ScannedRange, cached: ScannedRange[]): ScannedRange[] {
  if (desired.end < desired.start) return [];

  const relevant = mergeRanges(cached.filter((r) => r.end >= desired.start && r.start <= desired.end));

  if (relevant.length === 0) return [desired];

  const gaps: ScannedRange[] = [];
  let cursor = desired.start;

  for (const r of relevant) {
    if (r.start > cursor) {
      gaps.push({ start: cursor, end: r.start - 1 });
    }
    cursor = Math.max(cursor, r.end + 1);
  }

  if (cursor <= desired.end) {
    gaps.push({ start: cursor, end: desired.end });
  }

  return gaps;
}

// ─── Cache read helpers ───────────────────────────────────────────────────────

/**
 * Search all cache entries for the given source chain and return the first
 * message matching `txHash`, or null if not found.
 *
 * Note: a single tx can produce multiple messages — this returns whichever
 * one is found first.  Callers needing all messages from a tx should use
 * `findMessagesInCache`.
 */
export function findMessageInCache(srcChainId: number, txHash: string): Message | null {
  const matches = findMessagesInCache(srcChainId, txHash);
  return matches[0] ?? null;
}

/**
 * Search all cache entries for the given source chain and return ALL
 * messages matching `txHash`.  Useful for tx-detail pages that need to
 * display every message dispatched in a single transaction.
 */
export function findMessagesInCache(srcChainId: number, txHash: string): Message[] {
  if (typeof window === "undefined") return [];
  const prefix = `${CACHE_PREFIX}${srcChainId}_`;
  const normalized = normalizeHash(txHash);
  const out: Message[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const entry = JSON.parse(raw) as CacheEntry;
      if (entry.version !== CACHE_VERSION) continue;
      for (const m of entry.messages) {
        if (normalizeHash(m.txHash) === normalized) out.push(m);
      }
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * Return cached messages that fall within `range`, sorted newest-first.
 */
export function getCachedMessages(srcId: number, dstId: number, range?: ScannedRange): Message[] {
  const entry = getCache(srcId, dstId);
  if (!entry) return [];
  const msgs = range
    ? entry.messages.filter((m) => m.blockNumber >= range.start && m.blockNumber <= range.end)
    : entry.messages;
  return [...msgs].sort((a, b) => b.blockNumber - a.blockNumber);
}

// ─── Cache write helpers ──────────────────────────────────────────────────────

/**
 * Persist a newly-scanned chunk (range + its messages) into the cache.
 *
 * - Merges `newRange` into the existing scanned-ranges list.
 * - Deduplicates messages by `messageId` (or `txHash:nonce` fallback) so
 *   batch dispatches in a single tx are all retained.
 * - Sorts newest-first and trims to MAX_CACHED_MESSAGES.
 * - If trimming drops messages, clamps `scannedRanges` so we don't claim
 *   coverage for blocks whose messages were evicted.
 *
 * Call this after every chunk (even empty ones) so we don't rescan them.
 */
export function updateCache(srcId: number, dstId: number, newRange: ScannedRange, newMessages: Message[]): void {
  const existing = getCache(srcId, dstId) ?? {
    version: CACHE_VERSION,
    scannedRanges: [],
    messages: [],
    lastUpdated: 0,
  };

  // Deduplicate by messageId (existing messages take precedence).
  const seen = new Set<string>(existing.messages.map(messageKey));
  const fresh = newMessages.filter((m) => {
    const key = messageKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const combined = [...existing.messages, ...fresh].sort((a, b) => b.blockNumber - a.blockNumber);

  const trimmed = combined.slice(0, MAX_CACHED_MESSAGES);
  const droppedCount = combined.length - trimmed.length;

  let mergedRanges = mergeRanges([...existing.scannedRanges, newRange]);

  // If we evicted messages, clamp scanned-range coverage to the lowest
  // block we still hold.  Anything below that becomes "unscanned" again.
  if (droppedCount > 0 && trimmed.length > 0) {
    const minRetainedBlock = trimmed[trimmed.length - 1].blockNumber;
    mergedRanges = clampRangesAbove(mergedRanges, minRetainedBlock);
  }

  setCache(srcId, dstId, {
    version: CACHE_VERSION,
    scannedRanges: mergedRanges,
    messages: trimmed,
    lastUpdated: Date.now(),
  });
}
