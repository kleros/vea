import { isRevertError } from "./revertClass";
import { decideStaticCallFailure } from "./staticCallFailure";
import { revertClassFixtures, T1, T2, R1, R2, R3, INVALID_PROOF_DATA } from "../../tests/relay/revertFixtures";

describe("revertClass", () => {
  describe("fixtures", () => {
    it("have the ethers 6.14.0 shapes of the classification table", () => {
      for (const [error, message] of [
        [T1, "limit exceeded"],
        [T2, "header not found"],
        [R1, "execution reverted"],
      ] as const) {
        expect(error).toMatchObject({ code: "CALL_EXCEPTION", data: null, shortMessage: "missing revert data" });
        expect((error as any).info.error.message).toBe(message);
      }
      expect(R2).toMatchObject({ code: "CALL_EXCEPTION", data: "0x" });
      expect(R3).toMatchObject({ code: "CALL_EXCEPTION", data: INVALID_PROOF_DATA, reason: "Invalid proof." });
    });
  });

  describe("isRevertError", () => {
    it.each(revertClassFixtures)("classifies $id as revert: $revert", ({ error, revert }) => {
      expect(isRevertError(error)).toBe(revert);
    });

    it("never reads message or shortMessage", () => {
      const error = Object.assign(new Error("execution reverted"), {
        code: "CALL_EXCEPTION",
        data: null,
        shortMessage: "execution reverted",
        info: { error: { code: -32005, message: "limit exceeded" } },
      });
      expect(isRevertError(error)).toBe(false);
    });

    it("classifies non-error values as transport", () => {
      expect(isRevertError(undefined)).toBe(false);
      expect(isRevertError(null)).toBe(false);
      expect(isRevertError("execution reverted")).toBe(false);
    });
  });

  describe("decideStaticCallFailure", () => {
    it("stops on a transport error without reading the count again", async () => {
      const readCount = jest.fn();
      await expect(decideStaticCallFailure(T1, 7, readCount)).resolves.toBe("stop");
      expect(readCount).not.toHaveBeenCalled();
    });

    it("skips a revert when the count is unchanged", async () => {
      await expect(decideStaticCallFailure(R1, 7, jest.fn().mockResolvedValue(7))).resolves.toBe("skip");
    });

    it("drops the batch on a revert when the count changed", async () => {
      await expect(decideStaticCallFailure(R3, 7, jest.fn().mockResolvedValue(8))).resolves.toBe("drop");
    });

    it("propagates an error of the count read", async () => {
      const failure = new Error("indexer down");
      await expect(decideStaticCallFailure(R3, 7, jest.fn().mockRejectedValue(failure))).rejects.toBe(failure);
    });
  });
});
