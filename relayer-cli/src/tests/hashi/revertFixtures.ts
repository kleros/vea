import { AbiCoder, Interface, makeError } from "ethers";
import { YaruAbi } from "../../utils/hashiHelpers/abi";

// The error shapes ethers 6.14.0 produces for each node response, probed against a fake JSON-RPC server.
// eth_call turns every JSON-RPC error body into a CALL_EXCEPTION; only data or the node's own message tells them apart.

type NodeError = { code: number; message: string; data?: string };

const CALL_TO = "0x00000000000000000000000000000000000000aa";
const ethCallPayload = { method: "eth_call", params: [{ to: CALL_TO, data: "0x" }, "latest"], id: 1, jsonrpc: "2.0" };

const yaruIface = new Interface(YaruAbi);
const invalidProofData = "0x08c379a0" + AbiCoder.defaultAbiCoder().encode(["string"], ["Invalid proof."]).slice(2);
const callFailedData = yaruIface.encodeErrorResult("CallFailed", []);
const alreadyExecutedData = yaruIface.encodeErrorResult("MessageIdAlreadyExecuted", [7n]);

/**
 * A CALL_EXCEPTION as provider.call raises it from a JSON-RPC error body (AbiCoder.getBuiltinCallException plus info).
 */
function callException(
  nodeError: NodeError,
  data: string | null,
  shortMessage: string,
  reason: string | null = null
): Error {
  const error = makeError(shortMessage, "CALL_EXCEPTION", {
    action: "call",
    data,
    reason,
    transaction: { to: CALL_TO, data: "0x" },
    invocation: null,
    revert: reason === "Invalid proof." ? { signature: "Error(string)", name: "Error", args: [reason] } : null,
  } as any);
  (error as any).info = { error: nodeError, payload: ethCallPayload };
  return error;
}

/**
 * A revert with data as a contract method's staticCall raises it: Contract re-decodes it with the ABI, without info.
 */
function contractRevert(data: string): Error {
  return yaruIface.makeError(data, { to: CALL_TO, data: "0x" });
}

const nodeErrors: Record<string, NodeError> = {
  T1: { code: -32005, message: "limit exceeded" },
  T2: { code: -32000, message: "header not found" },
  R1: { code: -32000, message: "execution reverted" },
  R2: { code: 3, message: "execution reverted", data: "0x" },
  R3: { code: 3, message: "execution reverted: Invalid proof.", data: invalidProofData },
  R4: { code: 3, message: "execution reverted", data: callFailedData },
  R5: { code: 3, message: "execution reverted", data: alreadyExecutedData },
  A1: { code: -32000, message: "out of gas" },
  A2: { code: -32000, message: "invalid opcode: opcode 0xfe not defined" },
};

const errnoError = (code: string, message: string) => Object.assign(new Error(message), { code });

const fixtures = {
  T1: callException(nodeErrors.T1, null, "missing revert data"),
  T2: callException(nodeErrors.T2, null, "missing revert data"),
  T3: makeError("server response 500 Internal Server Error", "SERVER_ERROR", { request: null, response: null } as any),
  T4: errnoError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:8545"),
  T5: makeError("request timeout", "TIMEOUT", { operation: "request", reason: "timeout" } as any),
  T6: makeError("missing response for request", "BAD_DATA", { value: [], info: { payload: ethCallPayload } } as any),
  R1: callException(nodeErrors.R1, null, "missing revert data"),
  R2: callException(
    nodeErrors.R2,
    "0x",
    "execution reverted (no data present; likely require(false) occurred",
    "require(false)"
  ),
  R3: callException(nodeErrors.R3, invalidProofData, 'execution reverted: "Invalid proof."', "Invalid proof."),
  R4: callException(nodeErrors.R4, callFailedData, "execution reverted (unknown custom error)"),
  R5: callException(nodeErrors.R5, alreadyExecutedData, "execution reverted (unknown custom error)"),
  A1: callException(nodeErrors.A1, null, "missing revert data"),
  A2: callException(nodeErrors.A2, null, "missing revert data"),
};

type FixtureId = keyof typeof fixtures;

// The Yaru preflight shapes of R2-R5: executeMessages.staticCall re-decodes revert data with the Yaru ABI.
const preflightFixtures = {
  R2: contractRevert("0x"),
  R3: contractRevert(invalidProofData),
  R4: contractRevert(callFailedData),
  R5: contractRevert(alreadyExecutedData),
};

export { fixtures, preflightFixtures, nodeErrors, ethCallPayload, FixtureId };
