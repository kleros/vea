import { scanLogs, findFirstLog, findLatestLog } from "./logScanner";

/**
 * A minimal stand-in for an ethers Contract that records the block ranges it is
 * asked for and serves logs from a fixed set. Logs are plain objects with the
 * only two fields the scanner itself cares about: blockNumber and index.
 */
const makeContract = (logs: Array<{ blockNumber: number; index: number }> = []) => {
  const ranges: Array<[number, number]> = [];
  const contract = {
    queryFilter: jest.fn(async (_filter: any, from: number, to: number) => {
      ranges.push([from, to]);
      return logs.filter((log) => log.blockNumber >= from && log.blockNumber <= to);
    }),
  };
  return { contract, ranges };
};

describe("logScanner", () => {
  describe("scanLogs", () => {
    it("splits the range into chunks that tile it exactly, with no gap or overlap", async () => {
      const { contract, ranges } = makeContract();

      await scanLogs({ contract, filter: {}, fromBlock: 100, toBlock: 2500, chunkSize: 1000 });

      expect(ranges).toEqual([
        [100, 1099],
        [1100, 2099],
        [2100, 2500],
      ]);
    });

    it("halves the chunk size and retries the same chunk when the provider rejects the range", async () => {
      const providerLimit = 500;
      const served: Array<[number, number]> = [];
      const contract = {
        queryFilter: jest.fn(async (_filter: any, from: number, to: number) => {
          if (to - from + 1 > providerLimit) throw new Error("query returned more than 10000 results");
          served.push([from, to]);
          return [];
        }),
      };

      await scanLogs({ contract, filter: {}, fromBlock: 0, toBlock: 1999, chunkSize: 1000 });

      // The scanner discovers the provider's real limit and still covers the whole range.
      expect(served).toEqual([
        [0, 499],
        [500, 999],
        [1000, 1499],
        [1500, 1999],
      ]);
    });

    it("rethrows the provider error once the chunk size has shrunk to the floor", async () => {
      const contract = {
        queryFilter: jest.fn(async () => {
          throw new Error("provider is down");
        }),
      };

      await expect(
        scanLogs({ contract, filter: {}, fromBlock: 0, toBlock: 1999, chunkSize: 1000, minChunkSize: 250 })
      ).rejects.toThrow("provider is down");
    });

    it("stops at the first chunk containing a log when scanning forward", async () => {
      const attempted: Array<[number, number]> = [];
      const contract = {
        queryFilter: jest.fn(async (_filter: any, from: number, to: number) => {
          attempted.push([from, to]);
          return [{ blockNumber: 1750, index: 0 }].filter((log) => log.blockNumber >= from && log.blockNumber <= to);
        }),
      };

      const result = await scanLogs({
        contract,
        filter: {},
        fromBlock: 0,
        toBlock: 2999,
        chunkSize: 1000,
        stopOnFirstHit: true,
      });

      expect(attempted).toEqual([
        [0, 999],
        [1000, 1999],
      ]);
      expect(result).toEqual([{ blockNumber: 1750, index: 0 }]);
    });

    it("scans backward from the newest block when direction is backward", async () => {
      const attempted: Array<[number, number]> = [];
      const contract = {
        queryFilter: jest.fn(async (_filter: any, from: number, to: number) => {
          attempted.push([from, to]);
          return [{ blockNumber: 1750, index: 0 }].filter((log) => log.blockNumber >= from && log.blockNumber <= to);
        }),
      };

      const result = await scanLogs({
        contract,
        filter: {},
        fromBlock: 0,
        toBlock: 1999,
        chunkSize: 1000,
        direction: "backward",
        stopOnFirstHit: true,
      });

      // Newest chunk first, and the older half is never requested.
      expect(attempted).toEqual([[1000, 1999]]);
      expect(result).toEqual([{ blockNumber: 1750, index: 0 }]);
    });

    it("returns logs in ascending block order even when scanning backward", async () => {
      const logs = [
        { blockNumber: 150, index: 0 },
        { blockNumber: 1750, index: 0 },
      ];
      const contract = {
        queryFilter: jest.fn(async (_filter: any, from: number, to: number) =>
          logs.filter((log) => log.blockNumber >= from && log.blockNumber <= to)
        ),
      };

      const result = await scanLogs({
        contract,
        filter: {},
        fromBlock: 0,
        toBlock: 1999,
        chunkSize: 1000,
        direction: "backward",
      });

      expect(result.map((log: any) => log.blockNumber)).toEqual([150, 1750]);
    });
  });

  describe("findLatestLog", () => {
    it("returns the newest matching log", async () => {
      const { contract } = makeContract([
        { blockNumber: 150, index: 0 },
        { blockNumber: 1750, index: 0 },
        { blockNumber: 1750, index: 4 },
      ]);

      const result = await findLatestLog({ contract, filter: {}, fromBlock: 0, toBlock: 1999, chunkSize: 1000 });

      expect(result).toEqual({ blockNumber: 1750, index: 4 });
    });

    it("returns null when no log matches anywhere in the range", async () => {
      const { contract } = makeContract([]);

      const result = await findLatestLog({ contract, filter: {}, fromBlock: 0, toBlock: 1999, chunkSize: 1000 });

      expect(result).toBeNull();
    });
  });

  describe("findFirstLog", () => {
    it("returns the oldest matching log", async () => {
      const { contract } = makeContract([
        { blockNumber: 150, index: 3 },
        { blockNumber: 150, index: 1 },
        { blockNumber: 1750, index: 0 },
      ]);

      const result = await findFirstLog({ contract, filter: {}, fromBlock: 0, toBlock: 1999, chunkSize: 1000 });

      expect(result).toEqual({ blockNumber: 150, index: 1 });
    });

    it("returns null when no log matches anywhere in the range", async () => {
      const { contract } = makeContract([]);

      const result = await findFirstLog({ contract, filter: {}, fromBlock: 0, toBlock: 1999, chunkSize: 1000 });

      expect(result).toBeNull();
    });
  });
});
