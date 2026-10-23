import { isError, isHexString } from "ethers";

/**
 * What a failed eth_call-backed read (a `provider.call` or a contract method's `staticCall`) says about the call:
 * - REVERT: the contract reverted.
 * - VM_ABORT: the EVM aborted the call (out of gas, invalid opcode, stack or jump errors, ...).
 * - TRANSPORT: the provider failed; the call says nothing about the message.
 * - UNKNOWN: a node error body that no rule ties to the message or to the provider. Callers halt on it as on
 *   TRANSPORT: it is never read as message-specific.
 */
export enum CallFailure {
  REVERT = "REVERT",
  VM_ABORT = "VM_ABORT",
  TRANSPORT = "TRANSPORT",
  UNKNOWN = "UNKNOWN",
}

// Node wordings of a VM abort other than a revert. A closed list: each marker is shown by a test fixture.
const VM_ABORT_MARKERS = [
  "out of gas",
  "outofgas",
  "memory limit exceeded",
  "gas uint64 overflow",
  "invalid opcode",
  "invalid instruction",
  "badinstruction",
  "invalidfeopcode",
  "opcodenotfound",
  "invalid jump",
  "invalidjump",
  "badjumpdestination",
  "stack underflow",
  "stackunderflow",
  "stack overflow",
  "stackoverflow",
  "stack limit reached",
  "call depth",
  "write protection",
  "return data out of bounds",
];

// JSON-RPC error codes of a provider failure (resource, rate limit, unavailable or missing state).
const TRANSPORT_CODES: unknown[] = [-32001, -32002, -32005, -32007, -32016, -32017, -32029, -32090, 429];

// Node wordings of a provider failure.
const TRANSPORT_MARKERS = [
  "header not found",
  "block not found",
  "unknown block",
  "unsupported block number",
  "missing trie node",
  "rate limit",
  "too many requests",
  "limit exceeded",
  "timeout",
  "timed out",
  "execution aborted",
  "capacity",
  "unavailable",
  "busy",
];

// The node's data string is attacker-controlled (revert data); only its start is read.
const NODE_DATA_READ_LIMIT = 1024;

type NodeError = { code?: unknown; message?: unknown; data?: unknown };

/** The JSON-RPC error body ethers keeps in `info.error`, when there is one */
const nodeErrorOf = (error: unknown): NodeError | undefined => {
  const nodeError = (error as { info?: { error?: unknown } } | null | undefined)?.info?.error;
  return typeof nodeError === "object" && nodeError !== null ? (nodeError as NodeError) : undefined;
};

const lowerText = (value: unknown, limit?: number): string =>
  typeof value === "string" ? value.slice(0, limit).toLowerCase() : "";

const containsAny = (text: string, markers: string[]): boolean => markers.some((marker) => text.includes(marker));

/** Classify a CALL_EXCEPTION without revert data by its node error body, the checks in their order */
const classifyNodeError = (nodeError: NodeError): CallFailure => {
  const msg = lowerText(nodeError.message);
  const data = lowerText(nodeError.data, NODE_DATA_READ_LIMIT);
  if (nodeError.code === 3) return CallFailure.REVERT;
  if (msg.includes("revert") || data.includes("revert")) return CallFailure.REVERT;
  if (containsAny(msg, VM_ABORT_MARKERS) || containsAny(data, VM_ABORT_MARKERS)) return CallFailure.VM_ABORT;
  if (nodeError.code === -32015 && msg.includes("vm execution error")) return CallFailure.REVERT;
  if (TRANSPORT_CODES.includes(nodeError.code) || containsAny(msg, TRANSPORT_MARKERS)) return CallFailure.TRANSPORT;
  return CallFailure.UNKNOWN;
};

/**
 * Classify the error of a failed eth_call-backed read.
 * ethers 6 turns every JSON-RPC error body of an eth_call (rate limits included) into a CALL_EXCEPTION, so only
 * revert data or the node's own error body (`info.error`) tells a contract failure apart from a provider failure.
 * `e.message` and `e.shortMessage` are never read: ethers sets "missing revert data" on every data-less
 * CALL_EXCEPTION.
 * @param error The error thrown by provider.call or a contract method's staticCall
 * @returns The failure class
 */
export function classifyCallFailure(error: unknown): CallFailure {
  if (!isError(error, "CALL_EXCEPTION")) return CallFailure.TRANSPORT;
  if (typeof error.data === "string" && isHexString(error.data)) return CallFailure.REVERT;
  return classifyNodeError(nodeErrorOf(error) ?? {});
}

/** Whether a failure class ties the failure to the call's own message (a revert or a VM abort) */
export function isMessageSpecific(failure: CallFailure): boolean {
  return failure === CallFailure.REVERT || failure === CallFailure.VM_ABORT;
}

/**
 * The revert data of a failed call: `e.data` when it is hex, else the node's `info.error.data` when it is hex.
 * ethers keeps the node's hex data in `e.data` only when the node's message mentions "revert".
 * @param error The error thrown by the call
 * @returns The hex revert data, or undefined when there is none
 */
export function revertDataOf(error: unknown): string | undefined {
  const data = (error as { data?: unknown } | null | undefined)?.data;
  if (typeof data === "string" && isHexString(data)) return data;
  const nodeData = nodeErrorOf(error)?.data;
  return typeof nodeData === "string" && isHexString(nodeData) ? nodeData : undefined;
}
