import { isError, isHexString } from "ethers";

// Yaru custom error selectors, kept literal so the preflight never depends on decoding.
const CALL_FAILED_SELECTOR = "0x3204506f";
const MESSAGE_ID_ALREADY_EXECUTED_SELECTOR = "0x5919bfee";

// Node wordings of a data-less VM abort (geth and compatible clients).
const VM_ABORT_MARKERS = [
  "out of gas",
  "outofgas",
  "invalid opcode",
  "invalid jump",
  "stack underflow",
  "stack overflow",
  "call depth",
];

enum PreflightFailure {
  TRANSPORT = "TRANSPORT",
  ALREADY_EXECUTED = "ALREADY_EXECUTED",
  CALL_FAILED = "CALL_FAILED",
  OTHER_REVERT = "OTHER_REVERT",
}

const nodeErrorMessage = (error: any): string | undefined => {
  const message = error?.info?.error?.message;
  return typeof message === "string" ? message : undefined;
};

/**
 * Whether an error from an eth_call-backed read means the contract reverted.
 * ethers 6 maps every JSON-RPC error body of an eth_call (rate limits included) to a data-less CALL_EXCEPTION,
 * so only revert data or the node's own "revert" wording counts. e.message and e.shortMessage are never read:
 * ethers sets "missing revert data" on every data-less CALL_EXCEPTION.
 * @param error The error thrown by provider.call or a contract method's staticCall
 * @returns true for a revert, false for a transport failure
 */
function isRevertClass(error: unknown): boolean {
  if (!isError(error, "CALL_EXCEPTION")) return false;
  if (typeof error.data === "string" && isHexString(error.data)) return true;
  return nodeErrorMessage(error)?.toLowerCase().includes("revert") ?? false;
}

/**
 * Whether a data-less CALL_EXCEPTION is a node-reported VM abort (out of gas, invalid opcode, ...).
 * @param error The error thrown by provider.call
 * @returns true when the node's own error message or string data names a VM abort
 */
function isVmAbort(error: unknown): boolean {
  if (!isError(error, "CALL_EXCEPTION") || error.data != null) return false;
  const nodeError = (error as any).info?.error;
  const texts = [nodeErrorMessage(error), typeof nodeError?.data === "string" ? nodeError.data : undefined];
  return texts.some((text) => text !== undefined && VM_ABORT_MARKERS.some((m) => text.toLowerCase().includes(m)));
}

/**
 * Whether a failed Hashi threshold check should skip the message instead of failing the route.
 * @param error The error thrown by the checkHashWithThresholdFromAdapters call
 * @returns true for a revert or a VM abort, false for a transport failure
 */
function isSkippableThresholdError(error: unknown): boolean {
  return isRevertClass(error) || isVmAbort(error);
}

/**
 * Classify a failed Yaru.executeMessages preflight.
 * @param error The error thrown by executeMessages.staticCall
 * @returns The failure kind
 */
function classifyPreflightError(error: unknown): PreflightFailure {
  if (!isRevertClass(error)) return PreflightFailure.TRANSPORT;
  const { data, revert } = error as { data?: unknown; revert?: { name?: string } | null };
  const selector = typeof data === "string" ? data.slice(0, 10).toLowerCase() : undefined;
  if (selector === MESSAGE_ID_ALREADY_EXECUTED_SELECTOR || revert?.name === "MessageIdAlreadyExecuted") {
    return PreflightFailure.ALREADY_EXECUTED;
  }
  if (selector === CALL_FAILED_SELECTOR || revert?.name === "CallFailed") {
    return PreflightFailure.CALL_FAILED;
  }
  return PreflightFailure.OTHER_REVERT;
}

export {
  CALL_FAILED_SELECTOR,
  MESSAGE_ID_ALREADY_EXECUTED_SELECTOR,
  PreflightFailure,
  isRevertClass,
  isVmAbort,
  isSkippableThresholdError,
  classifyPreflightError,
};
