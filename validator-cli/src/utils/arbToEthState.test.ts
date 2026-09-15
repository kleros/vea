import { getSequencerDelaySeconds, resolveSettledReadBlocks } from "./arbToEthState";
import { BotEvents } from "./botEvents";

describe("arbToEthState", () => {
  describe("getSequencerDelaySeconds", () => {
    it("reads delaySeconds out of the maxTimeVariation tuple", async () => {
      // maxTimeVariation returns [delayBlocks, futureBlocks, delaySeconds, futureSeconds]
      // with named accessors, exactly as ethers decodes a multi-value return.
      const tuple: any = [7200, 64, 86400, 768];
      tuple.delayBlocks = 7200;
      tuple.futureBlocks = 64;
      tuple.delaySeconds = 86400;
      tuple.futureSeconds = 768;
      const sequencer: any = { maxTimeVariation: jest.fn(async () => tuple) };

      const delaySeconds = await getSequencerDelaySeconds(sequencer);

      // Coercing the whole tuple yields NaN, which silently poisons every block
      // range derived from it.
      expect(Number.isNaN(delaySeconds)).toBe(false);
      expect(delaySeconds).toBe(86400);
    });
  });

  describe("resolveSettledReadBlocks", () => {
    const epoch = 100;
    const epochPeriod = 7200;
    const epochBoundary = (epoch + 1) * epochPeriod; // 727200

    // Finalized sits comfortably past the boundary; latest runs ~1000s ahead of
    // it, mirroring the real Arbitrum finalized/latest lag.
    const FINALIZED_INBOX = { number: 306_763_304, timestamp: epochBoundary + 4_000 };
    const LATEST_INBOX = { number: 306_767_570, timestamp: epochBoundary + 5_064 };
    const FINALIZED_OUTBOX = { number: 9_000_000, timestamp: epochBoundary + 4_000 };

    const makeProviders = (inboxFinalized: any = FINALIZED_INBOX) => ({
      inboxProvider: {
        getBlock: jest.fn(async (tag: any) => (tag === "finalized" ? inboxFinalized : LATEST_INBOX)),
      } as any,
      outboxProvider: {
        getBlock: jest.fn(async () => FINALIZED_OUTBOX),
      } as any,
    });

    const emitted: any[][] = [];
    const emitter: any = { emit: (...args: any[]) => emitted.push(args) };
    beforeEach(() => (emitted.length = 0));

    const healthyFinality = jest.fn(async () => [FINALIZED_INBOX, FINALIZED_OUTBOX, false, false]) as any;

    it("pins to the finalized inbox block, never the latest one", async () => {
      const { inboxProvider, outboxProvider } = makeProviders();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider,
        outboxProvider,
        epoch,
        epochPeriod,
        emitter,
        fetchBlocksAndCheckFinality: healthyFinality,
      });

      // getBlocksAndCheckFinality hands back the latest block in its happy path;
      // staking a deposit on it exposes the read to an L2 reorg.
      expect(blocks).toEqual({ inboxBlock: FINALIZED_INBOX.number, outboxBlock: FINALIZED_OUTBOX.number });
      expect(blocks!.inboxBlock).not.toBe(LATEST_INBOX.number);
    });

    it("uses the blocks the finality check validated, without re-fetching them", async () => {
      const { inboxProvider, outboxProvider } = makeProviders();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider,
        outboxProvider,
        epoch,
        epochPeriod,
        emitter,
        fetchBlocksAndCheckFinality: healthyFinality,
      });

      // Re-fetching "finalized" would pin to a block the check never saw: the head
      // moves between the two calls, and the fallback provider may answer from a
      // different endpoint entirely.
      expect(inboxProvider.getBlock).not.toHaveBeenCalled();
      expect(outboxProvider.getBlock).not.toHaveBeenCalled();
      expect(blocks).toEqual({ inboxBlock: FINALIZED_INBOX.number, outboxBlock: FINALIZED_OUTBOX.number });
    });

    it("returns null instead of throwing when the finality check yields nothing", async () => {
      const { inboxProvider, outboxProvider } = makeProviders();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider,
        outboxProvider,
        epoch,
        epochPeriod,
        emitter,
        fetchBlocksAndCheckFinality: jest.fn(async () => undefined) as any,
      });

      expect(blocks).toBeNull();
      expect(emitted.some((e) => e[0] === BotEvents.FINALITY_ISSUE)).toBe(true);
    });

    it.each([
      ["arbitrum", [FINALIZED_INBOX, FINALIZED_OUTBOX, true, false]],
      ["ethereum", [FINALIZED_INBOX, FINALIZED_OUTBOX, false, true]],
    ])("refuses to decide while %s finality is flagged", async (_name, result) => {
      const { inboxProvider, outboxProvider } = makeProviders();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider,
        outboxProvider,
        epoch,
        epochPeriod,
        emitter,
        fetchBlocksAndCheckFinality: jest.fn(async () => result) as any,
      });

      expect(blocks).toBeNull();
      expect(emitted.some((e) => e[0] === BotEvents.FINALITY_ISSUE)).toBe(true);
    });

    it("refuses when the finalized inbox block still predates the epoch boundary", async () => {
      // snapshots[epoch] is written during epoch E, so a block inside epoch E can
      // hold a partial snapshot and would make an honest claim look fraudulent.
      const tooEarly = { number: 306_000_000, timestamp: epochBoundary - 1 };
      const { inboxProvider, outboxProvider } = makeProviders();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider,
        outboxProvider,
        epoch,
        epochPeriod,
        emitter,
        fetchBlocksAndCheckFinality: jest.fn(async () => [tooEarly, FINALIZED_OUTBOX, false, false]) as any,
      });

      expect(blocks).toBeNull();
      expect(emitted.some((e) => e[0] === BotEvents.EPOCH_NOT_SETTLED)).toBe(true);
    });

    it("accepts a finalized block exactly on the epoch boundary", async () => {
      const onBoundary = { number: 306_500_000, timestamp: epochBoundary };
      const { inboxProvider, outboxProvider } = makeProviders();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider,
        outboxProvider,
        epoch,
        epochPeriod,
        emitter,
        fetchBlocksAndCheckFinality: jest.fn(async () => [onBoundary, FINALIZED_OUTBOX, false, false]) as any,
      });

      expect(blocks).toEqual({ inboxBlock: onBoundary.number, outboxBlock: FINALIZED_OUTBOX.number });
    });
  });
});
