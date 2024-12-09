import { setEpochRange, getBlockNumberFromEpoch, checkForNewEpoch } from "./epochHandler";

describe("epochHandler", () => {
  describe("setEpochRange", () => {
    let veaOutbox: any;
    let startEpoch: number;
    beforeEach(() => {
      veaOutbox = {
        epochNow: jest.fn().mockResolvedValue(10),
      };
      startEpoch = 10;
    });
    it("should return an array of epoch", async () => {
      const result = await setEpochRange(veaOutbox, startEpoch);
      expect(result).toBeDefined();
      expect(result).toEqual([10]);
    });

    it("should throw an error if start<current epoch", async () => {
      startEpoch = 12;
      await expect(setEpochRange(veaOutbox, startEpoch)).rejects.toThrow("Current epoch is less than start epoch");
    });

    it("should return an array rolled back to default when no startEpoch provided", async () => {
      const currEpoch = await veaOutbox.epochNow();
      // 10 is the default epoch rollback
      const defaultEpochRollback = 10;
      startEpoch = currEpoch - defaultEpochRollback;
      const epochs: number[] = new Array(currEpoch - startEpoch + 1)
        .fill(currEpoch - defaultEpochRollback)
        .map((el, i) => el + i);
      const result = await setEpochRange(veaOutbox, startEpoch);
      expect(result).toBeDefined();
      expect(result).toEqual(epochs);
    });
  });
  describe("getBlockNumberFromEpoch", () => {
    let veaOutboxRpc: any;
    let epoch: number;
    const epochPeriod = 10;
    beforeEach(() => {
      veaOutboxRpc = {
        getBlock: jest.fn().mockImplementation((blockNumber) => {
          if (blockNumber === "latest") {
            return {
              number: 100000,
              timestamp: 1000000,
            };
          } else {
            return {
              number: 99000,
              timestamp: 990000,
            };
          }
        }),
      };
      epoch = 1000;
    });
    it("should return epoch block number", async () => {
      const result = await getBlockNumberFromEpoch(veaOutboxRpc, epoch, epochPeriod);
      expect(result).toBeDefined();
      expect(result).toBe(900);
    });
  });

  describe("checkForNewEpoch", () => {
    const epochPeriod = 10;
    let currentEpoch: number;

    beforeEach(() => {
      currentEpoch = 99;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should return a new epoch", () => {
      const mockDateNow = jest.spyOn(Date, "now").mockImplementation(() => 1010 * 1000);
      const result = checkForNewEpoch(currentEpoch, epochPeriod);
      expect(result).toBe(100);
      mockDateNow.mockRestore();
    });

    it("should return no new epoch", () => {
      const mockDateNow = jest.spyOn(Date, "now").mockImplementation(() => 1010 * 1000);
      currentEpoch = 100;
      const result = checkForNewEpoch(currentEpoch, epochPeriod);
      expect(result).toBe(100);
      mockDateNow.mockRestore();
    });
  });
});
