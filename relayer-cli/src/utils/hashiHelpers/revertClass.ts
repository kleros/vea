import { classifyCallFailure, isMessageSpecific, revertDataOf } from "../revertClassifier";

// Yaru custom error selectors, kept literal so the preflight never depends on decoding.
const CALL_FAILED_SELECTOR = "0x3204506f";
const MESSAGE_ID_ALREADY_EXECUTED_SELECTOR = "0x5919bfee";

enum PreflightFailure {
  TRANSPORT = "TRANSPORT",
  ALREADY_EXECUTED = "ALREADY_EXECUTED",
  CALL_FAILED = "CALL_FAILED",
  OTHER_REVERT = "OTHER_REVERT",
}

/**
 * Classify a failed Yaru.executeMessages preflight.
 * A failure the shared classifier does not tie to the message (transport or unknown) is TRANSPORT.
 * A revert or a VM abort is told apart by its Yaru selector, read from the revert data (`e.data`, else the node's
 * `info.error.data`) or from the decoded revert's name.
 * @param error The error thrown by executeMessages.staticCall
 * @returns The failure kind
 */
function classifyPreflightError(error: unknown): PreflightFailure {
  if (!isMessageSpecific(classifyCallFailure(error))) return PreflightFailure.TRANSPORT;
  const selector = revertDataOf(error)?.slice(0, 10).toLowerCase();
  const revertName = (error as { revert?: { name?: string } | null }).revert?.name;
  if (selector === MESSAGE_ID_ALREADY_EXECUTED_SELECTOR || revertName === "MessageIdAlreadyExecuted") {
    return PreflightFailure.ALREADY_EXECUTED;
  }
  if (selector === CALL_FAILED_SELECTOR || revertName === "CallFailed") {
    return PreflightFailure.CALL_FAILED;
  }
  return PreflightFailure.OTHER_REVERT;
}

export { CALL_FAILED_SELECTOR, MESSAGE_ID_ALREADY_EXECUTED_SELECTOR, PreflightFailure, classifyPreflightError };
