import { setEpochRange, getLatestChallengeableEpoch, blockAtTimestamp, getLookbackFloorBlock } from "./epochHandler";

describe("epochHandler", () => {
  describe("setEpochRange", () => {
    const currentEpoch = 1000000;

    const mockedEpochPeriod = 1000;
    const mockedSeqDelayLimit = 1000;
    const startCoolDown = 7 * 24 * 60 * 60;
    const currentTimestamp = currentEpoch * mockedEpochPeriod;
    const now = (currentTimestamp + mockedEpochPeriod + 1) * 1000; // In ms
    const startEpoch =
      Math.floor((currentTimestamp - (mockedSeqDelayLimit + mockedEpochPeriod + startCoolDown)) / mockedEpochPeriod) -
      1;
    it("should return the correct epoch range", () => {
      const mockedFetchBridgeConfig = jest.fn(() => ({
        epochPeriod: mockedEpochPeriod,
        sequencerDelayLimit: mockedSeqDelayLimit,
      }));

      const result = setEpochRange({
        chainId: 1,
        currentTimestamp,
        epochPeriod: mockedEpochPeriod,
        now,
        fetchBridgeConfig: mockedFetchBridgeConfig as any,
      });
      expect(result[result.length - 1]).toEqual(currentEpoch);
      expect(result[0]).toEqual(startEpoch);
    });
  });

  describe("getLatestChallengeableEpoch", () => {
    it("should return the correct epoch number", () => {
      const now = 1626325200000;
      const result = getLatestChallengeableEpoch(600, now);

      expect(result).toEqual(now / (600 * 1000) - 2);
    });
  });

  describe("blockAtTimestamp", () => {
    // A chain whose block time changed: 30s per block up to block 50_000, then
    // 12s per block after. A single average-rate estimate taken from the recent
    // (12s) blocks badly overshoots when reaching back into the 30s era.
    const timestampAt = (n: number): number => (n <= 50_000 ? n * 30 : 50_000 * 30 + (n - 50_000) * 12);
    const latestNumber = 100_000;

    const makeProvider = () => {
      const requested: number[] = [];
      return {
        requested,
        provider: {
          getBlock: jest.fn(async (tag: any) => {
            const number = typeof tag === "number" ? tag : latestNumber;
            requested.push(number);
            return { number, timestamp: timestampAt(number) };
          }),
        } as any,
      };
    };

    it("finds the block containing a timestamp on a chain with non-uniform block times", async () => {
      const { provider } = makeProvider();

      const result = await blockAtTimestamp({ provider, timestamp: 900_000 });

      expect(result).toBe(30_000);
    });

    it("never returns a block newer than the target timestamp", async () => {
      const { provider } = makeProvider();

      const result = await blockAtTimestamp({ provider, timestamp: 900_001 });

      expect(timestampAt(result)).toBeLessThanOrEqual(900_001);
    });

    it("returns the exact block, not an approximation", async () => {
      const { provider } = makeProvider();

      // Every timestamp in a run of blocks must map to the block containing it.
      for (const target of [900_000, 900_001, 900_029, 900_030, 1_600_000]) {
        const result = await blockAtTimestamp({ provider, timestamp: target });
        expect(timestampAt(result)).toBeLessThanOrEqual(target);
        expect(timestampAt(result + 1)).toBeGreaterThan(target);
      }
    });

    it("stays within a bounded number of probes", async () => {
      const { provider, requested } = makeProvider();

      await blockAtTimestamp({ provider, timestamp: 900_000 });

      expect(requested.length).toBeLessThanOrEqual(22);
    });

    it("never fetches the genesis block when the target is far from it", async () => {
      // A uniform-rate chain, so the derived lower bound lands close to the target.
      const uniform: any = {
        requested: [] as number[],
        getBlock: jest.fn(async function (this: any, tag: any) {
          const number = typeof tag === "number" ? tag : 100_000;
          uniform.requested.push(number);
          return { number, timestamp: number * 12 };
        }),
      };

      await blockAtTimestamp({ provider: uniform, timestamp: 900_000 });

      // Anchoring the search at block 0 costs a pointless round trip and makes
      // the starting bracket the whole chain.
      expect(uniform.requested).not.toContain(0);
    });

    it("clamps to the head block when the timestamp is in the future", async () => {
      const { provider } = makeProvider();

      const result = await blockAtTimestamp({ provider, timestamp: timestampAt(latestNumber) + 10_000 });

      expect(result).toBe(latestNumber);
    });

    it("clamps to the floor when the timestamp predates it", async () => {
      const { provider } = makeProvider();

      const result = await blockAtTimestamp({ provider, timestamp: 0, floorBlock: 1_000 });

      expect(result).toBe(1_000);
    });
  });

  describe("getLookbackFloorBlock", () => {
    const SEC_PER_BLOCK = 12;
    const HEAD_BLOCK = 1_000_000;
    const provider: any = {
      getBlock: jest.fn(async (tag: any) => {
        const number = typeof tag === "number" ? tag : HEAD_BLOCK;
        return { number, timestamp: number * SEC_PER_BLOCK };
      }),
    };

    it("reaches back exactly the protocol's worst-case sync window", async () => {
      const sequencerDelayLimit = 86_400;
      const epochPeriod = 7_200;
      const fetchBridgeConfig = jest.fn(() => ({ sequencerDelayLimit })) as any;

      const floor = await getLookbackFloorBlock({
        provider,
        chainId: 11155111,
        epochPeriod,
        fetchBridgeConfig,
      });

      // This is a cheap on-chain fast path with an indexer fallback behind it, so
      // it does not carry the cold-start backlog that setEpochRange needs. On
      // Arbitrum that backlog is ~2.4M blocks of empty scanning in the idle case.
      const expectedTimestamp = HEAD_BLOCK * SEC_PER_BLOCK - (sequencerDelayLimit + epochPeriod);
      expect(floor).toBe(expectedTimestamp / SEC_PER_BLOCK);
    });

    it("does not shrink the cold-start range setEpochRange depends on", async () => {
      const sequencerDelayLimit = 1000;
      const epochPeriod = 1000;
      const currentTimestamp = 1_000_000 * epochPeriod;
      const range = setEpochRange({
        chainId: 11155111,
        currentTimestamp,
        epochPeriod,
        now: (currentTimestamp + epochPeriod + 1) * 1000,
        fetchBridgeConfig: jest.fn(() => ({ sequencerDelayLimit })) as any,
      });

      // Still reaches back the full sequencerDelayLimit + epochPeriod + 7 days.
      const coldStartBacklog = 7 * 24 * 60 * 60;
      const expectedLowerBound =
        Math.floor((currentTimestamp - (sequencerDelayLimit + epochPeriod + coldStartBacklog)) / epochPeriod) - 1;
      expect(range[0]).toBe(expectedLowerBound);
    });

    it("never returns a negative block number on a young chain", async () => {
      const youngChain: any = {
        getBlock: jest.fn(async (tag: any) => {
          const number = typeof tag === "number" ? tag : 10;
          return { number, timestamp: number * SEC_PER_BLOCK };
        }),
      };

      const floor = await getLookbackFloorBlock({
        provider: youngChain,
        chainId: 11155111,
        epochPeriod: 7_200,
        fetchBridgeConfig: jest.fn(() => ({ sequencerDelayLimit: 86_400 })) as any,
      });

      expect(floor).toBeGreaterThanOrEqual(0);
    });
  });
});
