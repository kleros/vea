import { AbiCoder, Interface, JsonRpcProvider, Network, makeError } from "ethers";

/**
 * The error shapes ethers 6.14.0 produces for the node responses of the revert-classification table (T1-T6, R1-R3).
 * JSON-RPC error bodies go through ethers' own conversion (`getRpcError`, synchronous: no request is sent), and the
 * staticCall variants through the contract interface's re-raise of an error carrying revert data.
 */

const outboxInterface = new Interface([
  "function sendMessage(bytes32[] proof, uint64 msgId, address to, address from, bytes message)",
]);
const callTransaction = {
  to: "0x2222222222222222222222222222222222222222",
  data: outboxInterface.encodeFunctionData("sendMessage", [
    [],
    0,
    "0x3333333333333333333333333333333333333333",
    "0x4444444444444444444444444444444444444444",
    "0x",
  ]),
};
const callPayload = { method: "eth_call", params: [callTransaction, "latest"], id: 1, jsonrpc: "2.0" as const };
const converter = new JsonRpcProvider("http://127.0.0.1:1", Network.from(1), { staticNetwork: true });

/** The error ethers raises for a JSON-RPC error body answering an eth_call */
const fromRpcError = (error: { code: number; message?: string; data?: string }) =>
  converter.getRpcError(callPayload, { id: 1, error });

/** The error a contract's staticCall raises when the node's error carries revert data */
const fromStaticCall = (data: string) => outboxInterface.makeError(data, callTransaction);

export const INVALID_PROOF_DATA =
  "0x08c379a0" + AbiCoder.defaultAbiCoder().encode(["string"], ["Invalid proof."]).slice(2);

const connectionRefused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8545"), {
  code: "ECONNREFUSED",
  errno: -111,
  syscall: "connect",
});

export const T1 = fromRpcError({ code: -32005, message: "limit exceeded" });
export const T2 = fromRpcError({ code: -32000, message: "header not found" });
export const T3 = makeError("server response 500 Internal Server Error", "SERVER_ERROR");
export const T4 = connectionRefused;
export const T5 = makeError("timeout", "TIMEOUT", { operation: "request", reason: "timeout" });
export const T6 = makeError("missing response for request", "BAD_DATA", { value: null });
export const R1 = fromRpcError({ code: -32000, message: "execution reverted" });
export const R2 = fromRpcError({ code: 3, message: "execution reverted", data: "0x" });
export const R3 = fromRpcError({ code: 3, message: "execution reverted: Invalid proof.", data: INVALID_PROOF_DATA });
export const R2_STATIC_CALL = fromStaticCall("0x");
export const R3_STATIC_CALL = fromStaticCall(INVALID_PROOF_DATA);

/** Each fixture with its class: true for revert-class, false for transport-class */
export const revertClassFixtures: Array<{ id: string; error: unknown; revert: boolean }> = [
  { id: "T1 rate limit", error: T1, revert: false },
  { id: "T2 header not found", error: T2, revert: false },
  { id: "T3 HTTP 500", error: T3, revert: false },
  { id: "T4 connection refused", error: T4, revert: false },
  { id: "T5 timeout", error: T5, revert: false },
  { id: "T6 bad data", error: T6, revert: false },
  { id: "R1 empty revert (geth)", error: R1, revert: true },
  { id: "R2 revert data 0x", error: R2, revert: true },
  { id: "R2 through staticCall", error: R2_STATIC_CALL, revert: true },
  { id: "R3 Invalid proof.", error: R3, revert: true },
  { id: "R3 through staticCall", error: R3_STATIC_CALL, revert: true },
];
