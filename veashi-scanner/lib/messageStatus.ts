/**
 * On-chain status reads for Hashi messages, batched per destination chain.
 *
 * Per message there are two kinds of read, both on the destination chain:
 *  - `Yaru.executed(messageId)`: has the message been executed (the logic of the old `hooks/useExecutionStatus.ts`);
 *  - `Adapter.getHash(sourceChainId, messageId)` for each of the message's adapters: a non-zero hash means that
 *    bridge has stored the message (the logic of the old `hooks/useAdapters.ts`).
 *
 * All the reads for one destination chain go out together: one viem `multicall` (multicall3) when the chain's viem
 * definition lists multicall3, else plain `readContract` calls in parallel. A failed read is "not checked" (`null`),
 * never `false`: a failed RPC call says nothing about the message.
 */
import { createPublicClient, http, type Abi, type Address, type PublicClient } from "viem";
import { AdapterAbi, YaruAbi, getYaru } from "@kleros/veashi-sdk";
import { getRpcUrl, getViemChain } from "@/lib/chains";
import type { Message } from "@/lib/types";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * viem splits a multicall into chunks of this many bytes of call data, one `eth_call` each. A status read is 36 or
 * 68 bytes, so one chunk holds about 500 reads: in practice one request per chain per poll.
 */
const MULTICALL_BATCH_BYTES = 32_768;

/** Whether a message's status is known, waiting, or not checked (a read pending or failed). */
export type TripState = "executed" | "waiting" | "not-checked";

/** What is known about one message's trip. Every field that comes from a read is `null` until a read succeeds. */
export interface MessageStatus {
  /** `statusKey(message)`. */
  key: string;
  /** `Yaru.executed(messageId)` on the destination chain; `null` = not checked (not read yet, or every read failed). */
  executed: boolean | null;
  /**
   * Per adapter (lower-cased address, in the message's order): `true` = it stored the message's hash, `false` = it
   * has not, `null` = not checked.
   */
  adapters: Record<string, boolean | null>;
  /** How many adapters stored the hash; `null` until every adapter has been read once. */
  confirmed: number | null;
  /** The message's adapter count (`message.adapters.length`). */
  total: number;
  /** Adapters needed (`message.thresholdRequired`). */
  needed: number;
  /** `executed` as one word: "not-checked" whenever `executed` is `null`. */
  state: TripState;
  /** Nothing left to read: executed, and every adapter read. A final status is never read again. */
  final: boolean;
  /** At least one read for this message has finished, ok or failed. False = the first read is still pending. */
  attempted: boolean;
  /** False when the message lacks what a read needs (message ID, adapters, a Yaru for the route); it stays not checked. */
  readable: boolean;
  /** The last poll's failure for this message (a whole batch or one of its calls), or `null` when it went through. */
  error: string | null;
  /** When a read for this message last succeeded (ms since epoch), or `null`. */
  checkedAt: number | null;
}

/** One message's result from one poll: each value `null` when that call failed. */
export interface StatusRead {
  executed: boolean | null;
  /** In the order of `message.adapters`. */
  adapters: (boolean | null)[];
  error: string | null;
}

/** One poll of one destination chain, for the page's read log (`getStatusReadLog`). */
export interface StatusReadLogEntry {
  chainId: number;
  mode: "multicall" | "plain";
  messages: number;
  /** Contract reads in the batch (executed + getHash calls). */
  calls: number;
  /** HTTP requests the transport sent for this poll (retries included). */
  httpRequests: number;
  failedCalls: number;
  ms: number;
  at: number;
}

/** Stable identity of a message's status: source chain, destination chain and message ID (or tx hash and nonce). */
export function statusKey(m: Message): string {
  const id = m.messageId ? m.messageId.toLowerCase() : `${m.txHash.toLowerCase()}#${m.nonce ?? 0}`;
  return `${m.sourceChain}:${m.destinationChain}:${id}`;
}

/** The Yaru that executes a route's messages, or undefined when the SDK has none. */
function yaruFor(m: Message): Address | undefined {
  try {
    return (getYaru(m.sourceChain, m.destinationChain) as Address | undefined) || undefined;
  } catch {
    return undefined;
  }
}

/** The message ID as a number for the contract calls, or null when it is missing or not a number. */
function messageIdOf(m: Message): bigint | null {
  if (!m.messageId) return null;
  try {
    return BigInt(m.messageId);
  } catch {
    return null;
  }
}

/** Whether a message has what a status read needs. */
export function isReadable(m: Message): boolean {
  return messageIdOf(m) !== null && Array.isArray(m.adapters) && Boolean(yaruFor(m));
}

/** Whether viem's definition of the chain lists a multicall3 contract. */
export function hasMulticall3(chainId: number): boolean {
  // viem's chain union types `contracts` per chain; only the multicall3 entry matters here.
  const contracts = getViemChain(chainId)?.contracts as { multicall3?: { address?: string } } | undefined;
  return Boolean(contracts?.multicall3?.address);
}

// ─── Clients and the read log ─────────────────────────────────────────────────

const clients = new Map<number, PublicClient>();
const httpRequests = new Map<number, number>();
const readLog: StatusReadLogEntry[] = [];
const READ_LOG_MAX = 500;

/** One client per chain for status reads; its transport counts the HTTP requests it sends. */
function clientFor(chainId: number): PublicClient {
  let client = clients.get(chainId);
  if (!client) {
    client = createPublicClient({
      chain: getViemChain(chainId),
      transport: http(getRpcUrl(chainId), {
        onFetchRequest: () => {
          httpRequests.set(chainId, (httpRequests.get(chainId) ?? 0) + 1);
        },
      }),
    }) as PublicClient;
    clients.set(chainId, client);
  }
  return client;
}

/** Every status poll since the page loaded, oldest first (at most the last 500). */
export function getStatusReadLog(): readonly StatusReadLogEntry[] {
  return readLog;
}

function logRead(entry: StatusReadLogEntry) {
  readLog.push(entry);
  if (readLog.length > READ_LOG_MAX) readLog.splice(0, readLog.length - READ_LOG_MAX);
  console.info(
    `[status reads] chain ${entry.chainId}: ${entry.mode}, ${entry.messages} messages, ${entry.calls} calls, ` +
      `${entry.httpRequests} HTTP requests, ${entry.failedCalls} failed, ${entry.ms} ms`
  );
}

// ─── The read ─────────────────────────────────────────────────────────────────

type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };
type CallResult = { status: "success"; result: unknown } | { status: "failure"; error: unknown };

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message.split("\n")[0];
  return String(err);
}

/**
 * Reads the status of every readable message in `messages`, all bound for `chainId`, in one batch.
 * Never throws: a failed batch gives `null` for every value, with the error.
 */
export async function readStatusesOnChain(chainId: number, messages: Message[]): Promise<Map<string, StatusRead>> {
  const out = new Map<string, StatusRead>();
  const readable = messages.filter((m) => m.destinationChain === chainId && isReadable(m));
  if (readable.length === 0) return out;

  // Per message: its executed call, then one getHash call per adapter. isReadable has checked the ID and the Yaru.
  const calls: Call[] = [];
  const layout: { key: string; at: number; adapters: number }[] = [];
  for (const m of readable) {
    const id = messageIdOf(m) as bigint;
    const domain = BigInt(m.sourceChain);
    const adapters = m.adapters as string[];
    layout.push({ key: statusKey(m), at: calls.length, adapters: adapters.length });
    calls.push({ address: yaruFor(m) as Address, abi: YaruAbi as Abi, functionName: "executed", args: [id] });
    for (const adapter of adapters) {
      calls.push({ address: adapter as Address, abi: AdapterAbi as Abi, functionName: "getHash", args: [domain, id] });
    }
  }

  const multicall = hasMulticall3(chainId);
  const before = httpRequests.get(chainId) ?? 0;
  const started = Date.now();
  let results: CallResult[];
  let batchError: string | null = null;

  try {
    // Inside the try: a chain with no RPC URL fails here, and its messages still get a (failed) read.
    const client = clientFor(chainId);
    if (multicall) {
      // allowFailure: a failed call comes back as { status: "failure" } and the others still resolve.
      results = (await client.multicall({
        contracts: calls,
        allowFailure: true,
        batchSize: MULTICALL_BATCH_BYTES,
      })) as CallResult[];
    } else {
      const settled = await Promise.allSettled(calls.map((c) => client.readContract(c)));
      results = settled.map((s) =>
        s.status === "fulfilled" ? { status: "success", result: s.value } : { status: "failure", error: s.reason }
      );
    }
  } catch (err) {
    batchError = errorText(err);
    results = calls.map(() => ({ status: "failure", error: err }));
  }

  const failedCalls = results.filter((r) => r.status === "failure").length;
  logRead({
    chainId,
    mode: multicall ? "multicall" : "plain",
    messages: readable.length,
    calls: calls.length,
    httpRequests: (httpRequests.get(chainId) ?? 0) - before,
    failedCalls,
    ms: Date.now() - started,
    at: started,
  });

  for (const { key, at, adapters } of layout) {
    const mine = results.slice(at, at + 1 + adapters);
    const [exec, ...hashes] = mine;
    const failure = mine.find((r): r is Extract<CallResult, { status: "failure" }> => r.status === "failure");
    out.set(key, {
      executed: exec.status === "success" ? Boolean(exec.result) : null,
      adapters: hashes.map((r) => (r.status === "success" ? Boolean(r.result) && r.result !== ZERO_BYTES32 : null)),
      error: batchError ?? (failure ? errorText(failure.error) : null),
    });
  }
  return out;
}

// ─── Status from reads ────────────────────────────────────────────────────────

/** The status of a message before any read (or of one that cannot be read). */
export function initialStatus(m: Message): MessageStatus {
  const adapters: Record<string, boolean | null> = {};
  for (const a of m.adapters ?? []) adapters[a.toLowerCase()] = null;
  const readable = isReadable(m);
  return {
    key: statusKey(m),
    executed: null,
    adapters,
    confirmed: (m.adapters?.length ?? 0) === 0 && readable ? 0 : null,
    total: m.adapters?.length ?? 0,
    needed: m.thresholdRequired,
    state: "not-checked",
    final: false,
    attempted: !readable,
    readable,
    error: readable ? null : "This message lacks a message ID, its adapters or a Yaru for its route.",
    checkedAt: null,
  };
}

/**
 * Merges one poll's read into the last-known status. A failed value keeps the last-known one, and a known `true`
 * (executed, or a stored hash) is never taken back by a later `false`: neither can be undone on-chain, and a lagging
 * RPC node could report the older state.
 */
export function mergeStatus(prev: MessageStatus, m: Message, read: StatusRead, now = Date.now()): MessageStatus {
  const executed = prev.executed === true ? true : (read.executed ?? prev.executed);
  const adapters: Record<string, boolean | null> = { ...prev.adapters };
  (m.adapters ?? []).forEach((a, i) => {
    const key = a.toLowerCase();
    const last = adapters[key] ?? null;
    const value = read.adapters[i] ?? null;
    adapters[key] = last === true ? true : (value ?? last);
  });
  const values = Object.values(adapters);
  const confirmed = values.some((v) => v === null) ? null : values.filter((v) => v === true).length;
  const anyOk = read.executed !== null || read.adapters.some((v) => v !== null);
  return {
    ...prev,
    executed,
    adapters,
    confirmed,
    state: executed === null ? "not-checked" : executed ? "executed" : "waiting",
    final: executed === true && confirmed !== null,
    attempted: true,
    error: read.error,
    checkedAt: anyOk ? now : prev.checkedAt,
  };
}
