import {
  AbiCoder,
  Interface,
  JsonRpcError,
  JsonRpcPayload,
  JsonRpcProvider,
  Network,
  isCallException,
  makeError,
} from "ethers";
import { YaruAbi } from "../../utils/hashiHelpers/abi";

/**
 * The eth_call failures of the revert classifier's table, built as ethers 6.14.0 builds them.
 * A JSON-RPC error body goes through ethers' own conversion (`getRpcError`, synchronous: no request is sent), and a
 * contract's staticCall variant through ethers' re-raise of an error that carries revert data (`interface.makeError`,
 * which drops `info`). The P rows are the bodies public endpoints answered on 2026-10-16 (pn = publicnode,
 * drpc = drpc.org, 1rpc = 1rpc.io), copied verbatim.
 */

/** A JSON-RPC error body, as the node sends it */
export type NodeErrorBody = { code?: number; message?: string; data?: string };

const CALL_TO = "0x00000000000000000000000000000000000000aa";
export const ethCallPayload: JsonRpcPayload = {
  method: "eth_call",
  params: [{ to: CALL_TO, data: "0x" }, "latest"],
  id: 1,
  jsonrpc: "2.0",
};
const callTransaction = { to: CALL_TO, data: "0x" };
const converter = new JsonRpcProvider("http://127.0.0.1:1", Network.from(1), { staticNetwork: true });

/** The error ethers raises for a JSON-RPC error body answering an eth_call; null is an `error` member with no body */
export const fromNodeError = (body: NodeErrorBody | null): Error =>
  converter.getRpcError(ethCallPayload, { id: 1, error: body } as JsonRpcError);

/**
 * The error a contract method's staticCall raises for a failed call: ethers re-decodes an error that carries revert
 * data with the contract's interface, and rethrows every other error as it is.
 */
export const throughStaticCall = (error: Error, iface: Interface): Error =>
  isCallException(error) && error.data ? iface.makeError(error.data, callTransaction) : error;

const yaruIface = new Interface(YaruAbi);
export const INVALID_PROOF_DATA =
  "0x08c379a0" + AbiCoder.defaultAbiCoder().encode(["string"], ["Invalid proof."]).slice(2);
export const CALL_FAILED_DATA = yaruIface.encodeErrorResult("CallFailed", []);
export const ALREADY_EXECUTED_DATA = yaruIface.encodeErrorResult("MessageIdAlreadyExecuted", [7n]);

export const nodeBodies = {
  T1: { code: -32005, message: "limit exceeded" },
  T2: { code: -32000, message: "header not found" },
  T7: { code: 429, message: "Too Many Requests" },
  T8: { code: -32000, message: "execution aborted (timeout = 5s)" },
  T9: { code: -32000, message: "missing trie node 0x" + "ab".repeat(32) },
  R1: { code: -32000, message: "execution reverted" },
  R2: { code: 3, message: "execution reverted", data: "0x" },
  R3: { code: 3, message: "execution reverted: Invalid proof.", data: INVALID_PROOF_DATA },
  R4: { code: 3, message: "execution reverted", data: CALL_FAILED_DATA },
  R5: { code: 3, message: "execution reverted", data: ALREADY_EXECUTED_DATA },
  // Nethermind up to 1.33: the revert or the abort is only in `data`
  N1: { code: -32015, message: "VM execution error.", data: "Reverted " + INVALID_PROOF_DATA },
  N2: { code: -32015, message: "VM execution error.", data: "err: Invalid proof. (supplied gas 50000000)" },
  N3: { code: -32015, message: "VM execution error.", data: "err: OutOfGas (supplied gas 50000000)" },
  // A code-3 revert whose message lacks "revert": ethers leaves `e.data` null
  N4: { code: 3, message: "VM execution error.", data: CALL_FAILED_DATA },
  A1: { code: -32000, message: "out of gas" },
  A2: { code: -32000, message: "invalid opcode: opcode 0xfe not defined" },
  A3: { code: -32003, message: "out of gas: gas required exceeds: 50000000" },
  A4: { code: -32003, message: "EVM error: InvalidFEOpcode" },
  A5: { code: -32000, message: "invalid instruction" },
  // Besu's VM abort, or a real fault
  U1: { code: -32603, message: "Internal error" },
  U2: { code: -32000, message: "something unexpected" },
  // Provider faults that name no class: a rejected request, and an error member with no body (`"error": null`)
  U3: { code: -32602, message: "invalid params" },
  U4: null,
  // rev-nodata: eth·drpc, gno·official, gno·gatewayfm, chi·official, sep·pn, sep·drpc, sep·tenderly, sep·1rpc
  P1: { code: 3, message: "execution reverted" },
  // oog: sep·1rpc
  P2: { code: -32000, message: "runtime: out of gas" },
  // stack-underflow: eth·pn, gno·pn, gno·drpc, chi·pn, arb1·official, arb1·pn, arb1·drpc, arbsep·official, arbsep·pn, sep·1rpc
  P3: { code: -32000, message: "stack underflow (0 <=> 2)" },
  // bad-jump: gno·pn, gno·drpc, chi·pn, arb1·official, arb1·pn, arb1·drpc, arbsep·official, arbsep·pn, eth·1rpc
  P4: { code: -32000, message: "invalid jump destination" },
  // undefined-op: gno·pn, gno·drpc, chi·pn, arb1·official, arb1·pn, arb1·drpc, arbsep·official, arbsep·pn, eth·1rpc
  P5: { code: -32000, message: "invalid opcode: opcode 0xc not defined" },
  // undefined-op: eth·pn, eth·drpc, gno·official, gno·gatewayfm, chi·official, sep·pn, sep·drpc, sep·tenderly
  P6: { code: -32003, message: "EVM error: OpcodeNotFound" },
  // stack-underflow: eth·drpc, gno·official, gno·gatewayfm, chi·official, sep·pn, sep·drpc, sep·tenderly
  P7: { code: -32003, message: "EVM error: StackUnderflow" },
  // bad-jump: eth·pn, eth·drpc, gno·official, gno·gatewayfm, chi·official, sep·pn, sep·drpc, sep·tenderly, sep·1rpc
  P8: { code: -32003, message: "EVM error: InvalidJump" },
  // oog-mem: eth·pn, gno·official, gno·gatewayfm, chi·official, sep·pn, sep·tenderly
  P9: { code: -32003, message: "out of memory: memory limit exceeded during memory expansion" },
  // undefined-op: sep·1rpc
  P10: { code: 3, message: "revert: OpcodeNotFound" },
  // invalid-fe: sep·1rpc, an HTTP-200 error object with no code and no message
  P11: {},
  // future-block: gno·official, gno·gatewayfm, chi·official, sep·pn, sep·1rpc, sep·tenderly
  P12: { code: -32001, message: "block not found: 0xc53908" },
  // future-block: sep·1rpc
  P13: { code: -32000, message: "block not found: 12925188" },
  // future-block: arb1·official, arbsep·official
  P14: { code: -32000, message: "unsupported block number 516274903" },
} satisfies Record<string, NodeErrorBody | null>;

export type NodeBodyId = keyof typeof nodeBodies;

const connectionRefused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8545"), {
  code: "ECONNREFUSED",
  errno: -111,
  syscall: "connect",
});

// Failures that are not a JSON-RPC error body: an HTTP error, a socket error, a timeout, an undecodable response
const otherFailures = {
  T3: makeError("server response 500 Internal Server Error", "SERVER_ERROR", { request: null, response: null } as any),
  T4: connectionRefused,
  T5: makeError("request timeout", "TIMEOUT", { operation: "request", reason: "timeout" }),
  T6: makeError("missing response for request", "BAD_DATA", { value: [], info: { payload: ethCallPayload } }),
};

const fromBodies = Object.fromEntries(
  Object.entries(nodeBodies).map(([id, body]) => [id, fromNodeError(body)])
) as Record<NodeBodyId, Error>;

/** Every failure of the table, as `provider.call` raises it */
export const fixtures = { ...fromBodies, ...otherFailures };

export type FixtureId = keyof typeof fixtures;

/** The ids of the table, in its order */
export const FIXTURE_IDS = [
  ...["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"],
  ...["R1", "R2", "R3", "R4", "R5", "N1", "N2", "N3", "N4", "A1", "A2", "A3", "A4", "A5", "U1", "U2", "U3", "U4"],
  ...["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14"],
] as FixtureId[];

/** The Yaru preflight shape of a failure: executeMessages.staticCall re-decodes revert data with the Yaru ABI */
export const yaruStaticCall = (id: FixtureId): Error => throughStaticCall(fixtures[id], yaruIface);
