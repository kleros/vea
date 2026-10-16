import { decideStaticCallFailure } from "./staticCallFailure";
import { fixtures } from "../../tests/revert/fixtures";

describe("decideStaticCallFailure", () => {
  it("stops on a transport error without reading the count again", async () => {
    const readCount = jest.fn();
    await expect(decideStaticCallFailure(fixtures.T1, 7, readCount)).resolves.toBe("stop");
    expect(readCount).not.toHaveBeenCalled();
  });

  it.each(["U1", "U2", "U3", "U4", "P11"] as const)(
    "stops on an unknown failure (%s) without reading the count again",
    async (id) => {
      const readCount = jest.fn();
      await expect(decideStaticCallFailure(fixtures[id], 7, readCount)).resolves.toBe("stop");
      expect(readCount).not.toHaveBeenCalled();
    }
  );

  it("skips a revert when the count is unchanged", async () => {
    await expect(decideStaticCallFailure(fixtures.R1, 7, jest.fn().mockResolvedValue(7))).resolves.toBe("skip");
  });

  it("drops the batch on a revert when the count changed", async () => {
    await expect(decideStaticCallFailure(fixtures.R3, 7, jest.fn().mockResolvedValue(8))).resolves.toBe("drop");
  });

  it("skips a VM abort when the count is unchanged", async () => {
    await expect(decideStaticCallFailure(fixtures.A1, 7, jest.fn().mockResolvedValue(7))).resolves.toBe("skip");
  });

  it("drops the batch on a VM abort when the count changed", async () => {
    await expect(decideStaticCallFailure(fixtures.A3, 7, jest.fn().mockResolvedValue(8))).resolves.toBe("drop");
  });

  it("propagates an error of the count read", async () => {
    const failure = new Error("indexer down");
    await expect(decideStaticCallFailure(fixtures.R3, 7, jest.fn().mockRejectedValue(failure))).rejects.toBe(failure);
  });
});
