import { isError, isHexString } from "ethers";

/**
 * Tell a contract revert apart from a transport failure for an eth_call-backed read (a `staticCall` or `provider.call`).
 *
 * ethers turns every JSON-RPC error body of `eth_call` (rate limits, "header not found", ...) into a CALL_EXCEPTION
 * without data, so that code alone does not mean the contract reverted. The error is a revert only when it is a
 * CALL_EXCEPTION that carries revert data (`"0x"` included), or whose node error message mentions "revert".
 * `message` and `shortMessage` are never read: ethers sets "missing revert data" on every data-less CALL_EXCEPTION.
 *
 * @param error The error thrown by the read
 * @returns true for a revert, false for a transport failure (every other error or value)
 */
export const isRevertError = (error: unknown): boolean => {
  if (!isError(error, "CALL_EXCEPTION")) return false;
  if (typeof error.data === "string" && isHexString(error.data)) return true;
  const nodeMessage = error.info?.error?.message;
  return typeof nodeMessage === "string" && nodeMessage.toLowerCase().includes("revert");
};
