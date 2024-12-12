import { setEpochRange, getBlockNumberFromEpoch, getLatestVerifiableEpoch } from "./epochHandler";
import { InvalidStartEpochError } from "./errors";

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
      await expect(setEpochRange(veaOutbox, startEpoch)).rejects.toThrow(InvalidStartEpochError);
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

  describe("getLatestVerifiableEpoch", () => {
    const epochPeriod = 10;
    const chainId = 1;
    let currentEpoch: number;
    let mockGetBridgeConfig: jest.Mock;

    beforeEach(() => {
      currentEpoch = 99;
      mockGetBridgeConfig = jest.fn().mockReturnValue({
        epochPeriod,
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.only("should return a new epoch", () => {
      const mockNow = 1625097600000;
      const currentEpoch = getLatestVerifiableEpoch(chainId, mockNow, mockGetBridgeConfig);
      expect(currentEpoch).toBe(Math.floor(mockNow / 1000 / epochPeriod) - 1);
    });
  });
});
