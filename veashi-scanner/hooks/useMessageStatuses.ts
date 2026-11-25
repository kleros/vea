import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Message } from "@/lib/types";
import {
  initialStatus,
  mergeStatus,
  readStatusesOnChain,
  statusKey,
  type MessageStatus,
} from "@/lib/messageStatus";

/** Re-read a message that is not final this often: the refresh of the old useExecutionStatus and useAdapters hooks. */
const POLL_INTERVAL_MS = 10_000;
/** Wait this long after the message list changes before reading, so messages that arrive together share a batch. */
const SETTLE_MS = 250;
/**
 * Final statuses whose every adapter stored the hash survive a reload here: nothing about them can change. A final
 * status with an adapter still "not stored" is kept for the page load only, so a reload reads it again (a slower
 * bridge may confirm after execution).
 */
const FINAL_CACHE_KEY = "veashi_status_final_v1";
const FINAL_CACHE_MAX = 1000;

// ─── Shared store (one per page load, for every hook instance) ────────────────

const store = new Map<string, MessageStatus>();
const lastAttempt = new Map<string, number>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
/** What a render reads: a new object after every store change, so React sees the change. */
let snapshot: { version: number; inFlight: ReadonlySet<string> } = { version: 0, inFlight: new Set() };

function notify() {
  snapshot = { version: snapshot.version + 1, inFlight: new Set(inFlight) };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function getSnapshot() {
  return snapshot;
}

// ─── Final statuses in localStorage ───────────────────────────────────────────

type FinalEntry = { a: Record<string, boolean>; at: number };
let finals: Record<string, FinalEntry> | null = null;

function loadFinals(): Record<string, FinalEntry> {
  if (finals) return finals;
  finals = {};
  try {
    const raw = window.localStorage.getItem(FINAL_CACHE_KEY);
    if (raw) finals = JSON.parse(raw) as Record<string, FinalEntry>;
  } catch {
    // No storage (private window, blocked site data) or a bad entry: start empty.
  }
  return finals;
}

function saveFinal(s: MessageStatus) {
  const all = loadFinals();
  all[s.key] = { a: s.adapters as Record<string, boolean>, at: s.checkedAt ?? Date.now() };
  const keys = Object.keys(all);
  if (keys.length > FINAL_CACHE_MAX) {
    keys.sort((x, y) => all[x].at - all[y].at);
    for (const k of keys.slice(0, keys.length - FINAL_CACHE_MAX)) delete all[k];
  }
  try {
    window.localStorage.setItem(FINAL_CACHE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the in-memory store still holds it for this page load.
  }
}

/** A stored final status, when it covers every adapter the message names. */
function fromFinal(s: MessageStatus, f: FinalEntry): MessageStatus {
  const adapters = { ...s.adapters };
  for (const a of Object.keys(adapters)) {
    if (typeof f.a?.[a] !== "boolean") return s;
    adapters[a] = f.a[a];
  }
  return {
    ...s,
    executed: true,
    adapters,
    confirmed: Object.values(adapters).filter(Boolean).length,
    state: "executed",
    final: true,
    attempted: true,
    error: null,
    checkedAt: f.at,
  };
}

/** The message's status in the store, created (from the final cache when there) on first sight. */
function statusOf(m: Message): MessageStatus {
  const key = statusKey(m);
  let s = store.get(key);
  if (!s) {
    s = initialStatus(m);
    const f = s.readable ? loadFinals()[key] : undefined;
    if (f) s = fromFinal(s, f);
    store.set(key, s);
  }
  return s;
}

function uniqueByKey(messages: readonly Message[]): Message[] {
  const seen = new Map<string, Message>();
  for (const m of messages) if (!seen.has(statusKey(m))) seen.set(statusKey(m), m);
  return [...seen.values()];
}

/** Not final, readable, not being read, and not read in the last interval. */
function isDue(m: Message, now: number): boolean {
  const s = statusOf(m);
  if (!s.readable || s.final || inFlight.has(s.key)) return false;
  const last = lastAttempt.get(s.key);
  return last === undefined || now - last >= POLL_INTERVAL_MS;
}

/** Reads every due message, one batch per destination chain, and merges the results into the store. */
async function readDue(messages: Message[]): Promise<void> {
  const now = Date.now();
  const due = messages.filter((m) => isDue(m, now));
  if (due.length === 0) return;
  const byChain = new Map<number, Message[]>();
  for (const m of due) {
    inFlight.add(statusKey(m));
    lastAttempt.set(statusKey(m), now);
    byChain.set(m.destinationChain, [...(byChain.get(m.destinationChain) ?? []), m]);
  }
  notify();
  await Promise.allSettled(
    [...byChain].map(async ([chainId, list]) => {
      try {
        const reads = await readStatusesOnChain(chainId, list);
        const at = Date.now();
        for (const m of list) {
          const read = reads.get(statusKey(m));
          if (!read) continue;
          const next = mergeStatus(statusOf(m), m, read, at);
          store.set(next.key, next);
          if (next.final && next.confirmed === next.total) saveFinal(next);
        }
      } finally {
        for (const m of list) inFlight.delete(statusKey(m));
        notify();
      }
    })
  );
}

/** Milliseconds until the next message is due, or null when none is left to read. */
function nextDueIn(messages: Message[]): number | null {
  const now = Date.now();
  let next: number | null = null;
  for (const m of messages) {
    const s = statusOf(m);
    if (!s.readable || s.final) continue;
    const last = lastAttempt.get(s.key);
    const wait = last === undefined || inFlight.has(s.key) ? POLL_INTERVAL_MS : Math.max(0, last + POLL_INTERVAL_MS - now);
    next = next === null ? wait : Math.min(next, wait);
  }
  return next;
}

export interface UseMessageStatusesOptions {
  /** False pauses reading (statuses already known still show). Pass `!isScanning` to batch a page's first load. */
  enabled?: boolean;
}

export interface UseMessageStatusesResult {
  /** Status per `statusKey(message)`, for each message passed. */
  statuses: ReadonlyMap<string, MessageStatus>;
  /** One message's status (a "not checked" one when it was not passed). */
  get: (m: Message) => MessageStatus;
  /** Every readable message has had its first read finish (ok or failed): mount state-dependent parts after this. */
  firstReadDone: boolean;
  /** A read is in flight for one of these messages. */
  isReading: boolean;
}

/**
 * On-chain status of each message: executed or not, and which adapters stored its hash. Reads go out in one batch
 * per destination chain (multicall3 where viem lists it, else plain reads), are cached for the page load (final ones
 * in localStorage too), and are repeated every 10 s only for messages that are not final. A read that failed or has
 * not finished leaves a value `null`: show it as "not checked", never as a guess.
 */
export function useMessageStatuses(
  messages: readonly Message[],
  { enabled = true }: UseMessageStatusesOptions = {}
): UseMessageStatusesResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const list = useMemo(() => uniqueByKey(messages), [messages]);
  // The effect below restarts when the set of messages changes, not on every new array with the same messages.
  const ids = useMemo(() => list.map(statusKey).sort().join("|"), [list]);
  const latest = useRef(list);
  useEffect(() => {
    latest.current = list;
  }, [list]);

  useEffect(() => {
    if (!enabled || !ids) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await readDue(latest.current);
      if (cancelled) return;
      const wait = nextDueIn(latest.current);
      if (wait !== null) timer = setTimeout(tick, Math.max(wait, SETTLE_MS));
    };
    timer = setTimeout(tick, SETTLE_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ids, enabled]);

  return useMemo(() => {
    const statuses = new Map<string, MessageStatus>();
    for (const m of list) statuses.set(statusKey(m), statusOf(m));
    const readable = [...statuses.values()].filter((s) => s.readable);
    return {
      statuses,
      get: (m: Message) => statuses.get(statusKey(m)) ?? statusOf(m),
      firstReadDone: readable.every((s) => s.attempted),
      isReading: readable.some((s) => snap.inFlight.has(s.key)),
    };
  }, [list, snap]);
}
