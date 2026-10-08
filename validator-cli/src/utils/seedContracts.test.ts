// Frozen (validator-v1-fixes seed): pins the cross-lane interfaces every lane builds against.
import { resolveSettledReadBlocks, getOutboxReadBlock } from "./arbToEthState";
import { EpochOutcome, mergeOutcomes } from "./epochOutcome";
import { createTwoChainRoute } from "../testUtils/twoChainFixture";

describe("seed contracts", () => {
  describe("resolveSettledReadBlocks with l1Provider", () => {
    it("runs the finality check on the L1 provider and reads outboxBlock from the outbox chain itself", async () => {
      const route = createTwoChainRoute();
      const epochPeriod = 3600;
      const inboxFinalized = route.inbox.block("finalized");
      const l1Finalized = route.router.block("finalized");
      const epoch = Math.floor(inboxFinalized.timestamp / epochPeriod) - 1;
      const fetchBlocksAndCheckFinality = jest.fn().mockResolvedValue([inboxFinalized, l1Finalized, false, false]);

      const blocks = await resolveSettledReadBlocks({
        inboxProvider: route.inbox.provider,
        outboxProvider: route.outbox.provider,
        l1Provider: route.router.provider,
        epoch,
        epochPeriod,
        fetchBlocksAndCheckFinality,
      });

      expect(fetchBlocksAndCheckFinality.mock.calls[0][0]).toBe(route.router.provider);
      expect(blocks).not.toBeNull();
      expect(() => route.outbox.assertOwnBlock(blocks!.outboxBlock)).not.toThrow();
      expect(() => route.inbox.assertOwnBlock(blocks!.inboxBlock)).not.toThrow();
    });
  });

  describe("getOutboxReadBlock", () => {
    it("returns a block of the outbox chain", async () => {
      const route = createTwoChainRoute();
      const block = await getOutboxReadBlock({ outboxProvider: route.outbox.provider });
      expect(() => route.outbox.assertOwnBlock(block.number)).not.toThrow();
      expect(typeof block.timestamp).toBe("number");
    });
  });

  describe("mergeOutcomes", () => {
    it("keeps the more cautious outcome", () => {
      expect(mergeOutcomes(undefined, EpochOutcome.DONE)).toBe(EpochOutcome.DONE);
      expect(mergeOutcomes(EpochOutcome.DONE, EpochOutcome.PENDING)).toBe(EpochOutcome.PENDING);
      expect(mergeOutcomes(EpochOutcome.UNDECIDABLE, EpochOutcome.PENDING)).toBe(EpochOutcome.UNDECIDABLE);
      expect(mergeOutcomes(undefined, undefined)).toBeUndefined();
    });
  });
});
