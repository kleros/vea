import { Interface, JsonRpcError, JsonRpcProvider, Network, makeError } from "ethers";
import { CallFailure, classifyCallFailure, isMessageSpecific, revertDataOf } from "./revertClassifier";
import { ExecutionError } from "./errors";
import {
  CALL_FAILED_DATA,
  FIXTURE_IDS,
  FixtureId,
  INVALID_PROOF_DATA,
  NodeBodyId,
  ethCallPayload,
  fixtures,
  fromNodeError,
  nodeBodies,
  throughStaticCall,
  yaruStaticCall,
} from "../tests/revert/fixtures";

const { REVERT, VM_ABORT, TRANSPORT, UNKNOWN } = CallFailure;

const outboxInterface = new Interface([
  "function sendMessage(bytes32[] proof, uint64 msgId, address to, address from, bytes message)",
]);

const UNKNOWN_IDS = ["U1", "U2", "U3", "U4", "P11"] as const;

// Every fixture with its class
const table: [FixtureId, CallFailure][] = [
  ["T1", TRANSPORT],
  ["T2", TRANSPORT],
  ["T3", TRANSPORT],
  ["T4", TRANSPORT],
  ["T5", TRANSPORT],
  ["T6", TRANSPORT],
  ["T7", TRANSPORT],
  ["T8", TRANSPORT],
  ["T9", TRANSPORT],
  ["R1", REVERT],
  ["R2", REVERT],
  ["R3", REVERT],
  ["R4", REVERT],
  ["R5", REVERT],
  ["N1", REVERT],
  ["N2", REVERT],
  ["N3", VM_ABORT],
  ["N4", REVERT],
  ["A1", VM_ABORT],
  ["A2", VM_ABORT],
  ["A3", VM_ABORT],
  ["A4", VM_ABORT],
  ["A5", VM_ABORT],
  ["U1", UNKNOWN],
  ["U2", UNKNOWN],
  ["U3", UNKNOWN],
  ["U4", UNKNOWN],
  ["P1", REVERT],
  ["P2", VM_ABORT],
  ["P3", VM_ABORT],
  ["P4", VM_ABORT],
  ["P5", VM_ABORT],
  ["P6", VM_ABORT],
  ["P7", VM_ABORT],
  ["P8", VM_ABORT],
  ["P9", VM_ABORT],
  ["P10", REVERT],
  ["P11", UNKNOWN],
  ["P12", TRANSPORT],
  ["P13", TRANSPORT],
  ["P14", TRANSPORT],
];

describe("revertClassifier", () => {
  describe("fixtures", () => {
    it("cover every row of the table once", () => {
      expect(table.map(([id]) => id)).toEqual(FIXTURE_IDS);
      expect(Object.keys(fixtures).sort()).toEqual([...FIXTURE_IDS].sort());
    });

    it.each(Object.keys(nodeBodies) as NodeBodyId[])(
      "%s is the error ethers builds from its literal node body",
      (id) => {
        const provider = new JsonRpcProvider("http://127.0.0.1:1", Network.from(1), { staticNetwork: true });
        try {
          const built: any = provider.getRpcError(ethCallPayload, { id: 1, error: nodeBodies[id] } as JsonRpcError);
          const fixture: any = fixtures[id];
          expect(fixture.code).toBe("CALL_EXCEPTION");
          expect({ code: fixture.code, data: fixture.data, nodeError: fixture.info.error }).toEqual({
            code: built.code,
            data: built.data,
            nodeError: built.info.error,
          });
          expect(fixture.info.error).toEqual(nodeBodies[id]);
          expect(fixture.shortMessage).toBe(built.shortMessage);
          expect(fixture.reason).toBe(built.reason);
        } finally {
          provider.destroy();
        }
      }
    );

    it("have the ethers 6.14.0 shapes the rule reads", () => {
      for (const id of ["T1", "T2", "R1", "N1", "N2", "N3", "N4", "A1", "U3", "U4", "P1", "P10", "P11"] as const) {
        expect(fixtures[id]).toMatchObject({ code: "CALL_EXCEPTION", data: null, shortMessage: "missing revert data" });
      }
      expect(fixtures.R2).toMatchObject({ code: "CALL_EXCEPTION", data: "0x" });
      expect(fixtures.R3).toMatchObject({ code: "CALL_EXCEPTION", data: INVALID_PROOF_DATA, reason: "Invalid proof." });
      // The hex of a code-3 body whose message lacks "revert" survives only in info.error.data
      expect((fixtures.N4 as any).info.error.data).toBe("0x3204506f");
      expect((fixtures.P11 as any).info.error).toEqual({});
      expect((fixtures.U4 as any).info.error).toBeNull();
      // A staticCall re-raises an error carrying revert data without info, and every other error as it is
      expect((yaruStaticCall("R4") as any).info).toBeUndefined();
      expect(yaruStaticCall("R4")).toMatchObject({ code: "CALL_EXCEPTION", data: CALL_FAILED_DATA });
      expect(yaruStaticCall("N4")).toBe(fixtures.N4);
      expect(fixtures.T3).toMatchObject({ code: "SERVER_ERROR" });
      expect(fixtures.T4).toMatchObject({ code: "ECONNREFUSED" });
      expect(fixtures.T5).toMatchObject({ code: "TIMEOUT" });
      expect(fixtures.T6).toMatchObject({ code: "BAD_DATA" });
    });
  });

  describe("classifyCallFailure", () => {
    it.each(table)("classifies %s as %s", (id, failure) => {
      expect(classifyCallFailure(fixtures[id])).toBe(failure);
    });

    it.each(table)("classifies %s through a contract staticCall as %s", (id, failure) => {
      expect(classifyCallFailure(yaruStaticCall(id))).toBe(failure);
      expect(classifyCallFailure(throughStaticCall(fixtures[id], outboxInterface))).toBe(failure);
    });

    describe("applies its steps in order", () => {
      it.each([
        // Only a CALL_EXCEPTION is a contract failure, whatever else the error carries
        ["C1 before C2", makeError("bad", "SERVER_ERROR", { data: "0x" } as any), TRANSPORT],
        ["C1 for an ExecutionError", new ExecutionError("read", 1, "hashi", { cause: fixtures.R1 }), TRANSPORT],
        // ethers finds revert data in a nested object, while the node's own message names an abort
        [
          "C2 before C5",
          fromNodeError({ code: -32000, message: "out of gas", data: { message: "reverted", data: "0x" } } as any),
          REVERT,
        ],
        ["C3 before C7", fromNodeError({ code: 3, message: "request timed out" }), REVERT],
        ["C4 before C5", fromNodeError({ code: -32000, message: "execution reverted: out of gas" }), REVERT],
        ["C4 before C7", fromNodeError({ code: -32005, message: "execution reverted: rate limit" }), REVERT],
        ["C5 before C6", fixtures.N3, VM_ABORT],
        ["C5 before C7 (code)", fromNodeError({ code: -32005, message: "out of gas" }), VM_ABORT],
        ["C5 before C7 (word)", fixtures.P9, VM_ABORT],
        ["C6 before C7", fromNodeError({ code: -32015, message: "VM execution error. Request timed out" }), REVERT],
        ["C7 before C8 (code)", fromNodeError({ code: -32016, message: "something unexpected" }), TRANSPORT],
        ["C7 before C8 (word)", fromNodeError({ code: -32000, message: "server busy" }), TRANSPORT],
      ] as [string, unknown, CallFailure][])("%s", (_step, error, failure) => {
        expect(classifyCallFailure(error)).toBe(failure);
      });
    });

    it("never reads e.message or e.shortMessage", () => {
      const asText = (error: unknown, text: string) => ({ ...(error as object), message: text, shortMessage: text });
      expect(classifyCallFailure(asText(fixtures.T1, "execution reverted"))).toBe(TRANSPORT);
      expect(classifyCallFailure(asText(fixtures.U2, "out of gas"))).toBe(UNKNOWN);
      expect(classifyCallFailure(asText(fixtures.A1, "header not found"))).toBe(VM_ABORT);
      const error = Object.assign(new Error("execution reverted"), {
        code: "CALL_EXCEPTION",
        data: null,
        shortMessage: "execution reverted",
        info: { error: { code: -32005, message: "limit exceeded" } },
      });
      expect(classifyCallFailure(error)).toBe(TRANSPORT);
    });

    it("classifies non-error values as transport", () => {
      expect(classifyCallFailure(undefined)).toBe(TRANSPORT);
      expect(classifyCallFailure(null)).toBe(TRANSPORT);
      expect(classifyCallFailure("execution reverted")).toBe(TRANSPORT);
      expect(classifyCallFailure(new Error("execution reverted"))).toBe(TRANSPORT);
    });

    it("reads only the first 1,024 characters of the node's data", () => {
      const padded = (tail: string) =>
        fromNodeError({ code: -32000, message: "vm error", data: "x".repeat(1024) + tail });
      expect(classifyCallFailure(padded("revert"))).toBe(UNKNOWN);
      expect(classifyCallFailure(padded("out of gas"))).toBe(UNKNOWN);
      const huge = fromNodeError({
        code: -32015,
        message: "VM execution error.",
        data: "Reverted 0x" + "ab".repeat(1e6),
      });
      expect(classifyCallFailure(huge)).toBe(REVERT);
    });
  });

  describe("isMessageSpecific", () => {
    it.each([
      [REVERT, true],
      [VM_ABORT, true],
      [TRANSPORT, false],
      [UNKNOWN, false],
    ])("%s: %s", (failure, specific) => {
      expect(isMessageSpecific(failure)).toBe(specific);
    });
  });

  describe("revertDataOf", () => {
    it.each([
      ["N4 (hex only in info.error.data)", fixtures.N4, "0x3204506f"],
      ["R2", fixtures.R2, "0x"],
      ["R3", fixtures.R3, INVALID_PROOF_DATA],
      ["R4 through staticCall", yaruStaticCall("R4"), CALL_FAILED_DATA],
      ["N1 (data is text)", fixtures.N1, undefined],
      ["R1 (no data)", fixtures.R1, undefined],
      ["T1", fixtures.T1, undefined],
      ["T3", fixtures.T3, undefined],
      ["null", null, undefined],
    ] as [string, unknown, string | undefined][])("%s", (_id, error, data) => {
      expect(revertDataOf(error)).toBe(data);
    });
  });

  describe("a failure no rule places", () => {
    // Unmeasured client wordings and provider faults: each call site halts on them as on a transport failure
    it("covers the literal provider-fault bodies", () => {
      expect(nodeBodies.U1).toEqual({ code: -32603, message: "Internal error" });
      expect(nodeBodies.U3).toEqual({ code: -32602, message: "invalid params" });
      expect(nodeBodies.P11).toEqual({});
      expect(nodeBodies.U4).toBeNull();
    });

    it.each(UNKNOWN_IDS)("classifies %s as UNKNOWN, which is not message-specific", (id) => {
      expect(classifyCallFailure(fixtures[id])).toBe(UNKNOWN);
      expect(isMessageSpecific(classifyCallFailure(fixtures[id]))).toBe(false);
    });

    it("classifies a CALL_EXCEPTION with no info at all as UNKNOWN", () => {
      const error = makeError("missing revert data", "CALL_EXCEPTION", {
        action: "call",
        data: null,
        reason: null,
        transaction: { to: null, data: "0x" },
        invocation: null,
        revert: null,
      });
      expect((error as any).info).toBeUndefined();
      expect(classifyCallFailure(error)).toBe(UNKNOWN);
    });
  });
});
