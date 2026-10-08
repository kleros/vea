import {
  ArbBlockToL1Block,
  FALLBACK_L1_CONFIRMATIONS,
  getBlocksAndCheckFinality,
  getOutboxReadBlock,
  resetOutboxStallAlerts,
  resolveSettledReadBlocks,
} from "../../utils/arbToEthState";
import { setEpochRange, getLatestChallengeableEpoch } from "../../utils/epochHandler";
import { BotEvents } from "../../utils/botEvents";
import { createTwoChainRoute, TwoChainRoute } from "../../testUtils/twoChainFixture";
import { getBridgeConfig } from "../../consts/bridgeRoutes";
import { createFakeArbitrumL1, FakeArbitrumL1, SEQUENCER_DELAY_SECS } from "./fakeArbitrumL1";

// No test here reads a clock or sleeps; the timeout only lifts Jest's 5 s default, which a
// loaded verification machine can exceed (run 001), so the result never depends on speed.
jest.setTimeout(60_000);

const NOW = 1_760_000_000;
const P = 3600; // the Chiado testnet epoch period
const CURRENT_EPOCH = Math.floor(NOW / P);
// Decidable on finalized state: (E+1)·P is before the finalized Arbitrum block (~NOW - 1200).
const RECENT_EPOCH = Math.floor((NOW - 1200) / P) - 1;

// 30 hours of stalled L1 finality; Arbitrum's finalized block (which follows L1's) stalls with it.
const STALL_SECS = 30 * 3600;
// Decidable only by decision [O4]: (E+1)·P + sequencerDelayLimit is well before the fallback block.
const FALLBACK_EPOCH = Math.floor((NOW - SEQUENCER_DELAY_SECS - 3600) / P) - 1;

const recordEmitter = () => {
  const events: any[][] = [];
  return { events, emitter: { emit: (...args: any[]) => events.push(args) } as any };
};

const setup = ({ stalledL1 = false }: { stalledL1?: boolean } = {}) => {
  const route = createTwoChainRoute({ now: NOW });
  if (stalledL1) {
    // The fixture keeps its options object live, so the lags can be set per scenario.
    route.router.options.finalizedLag = STALL_SECS / route.router.options.secondsPerBlock;
    route.inbox.options.finalizedLag = (STALL_SECS + 1200) / route.inbox.options.secondsPerBlock;
  }
  const fake = createFakeArbitrumL1({ arb: route.inbox, l1: route.router });
  const l1ProvidersSeen: any[] = [];
  const deps = {
    connectSequencer: async (_arb: any, eth: any) => {
      l1ProvidersSeen.push(eth);
      return fake.sequencer;
    },
    connectNodeInterface: () => fake.nodeInterface,
  };
  const fetchBlocksAndCheckFinality = ((eth: any, arb: any, epoch: number, period: number, emitter: any) =>
    getBlocksAndCheckFinality(eth, arb, epoch, period, emitter, deps)) as typeof getBlocksAndCheckFinality;
  return { route, fake, deps, l1ProvidersSeen, fetchBlocksAndCheckFinality };
};

/** Record every block tag/number a fixture provider is asked for. */
const spyGetBlock = (provider: any): any[] => {
  const seen: any[] = [];
  const original = provider.getBlock;
  provider.getBlock = async (tag: any) => {
    seen.push(tag);
    return original(tag);
  };
  return seen;
};

const inRange = (chain: TwoChainRoute["router"], n: any) =>
  typeof n === "number" && n >= chain.options.firstBlock && n <= chain.options.headBlock;

describe("finality lane", () => {
  // getOutboxReadBlock remembers which chains it alerted as stalled (run-001 #13): start clean.
  beforeEach(() => resetOutboxStallAlerts());

  describe("PRD 1.2 gate side (BR-5): each chain is read at its own blocks", () => {
    it.each([
      ["healthy L1", false, RECENT_EPOCH],
      ["stalled L1 ([O4] fallback)", true, FALLBACK_EPOCH],
    ])(
      "with l1Provider the finality check runs on Sepolia and no Sepolia block number reaches Chiado (%s)",
      async (_name, stalledL1, epoch) => {
        const { route, l1ProvidersSeen, fetchBlocksAndCheckFinality } = setup({ stalledL1 });
        const chiadoTags = spyGetBlock(route.outbox.provider);
        const { emitter } = recordEmitter();

        const blocks = await resolveSettledReadBlocks({
          inboxProvider: route.inbox.provider,
          outboxProvider: route.outbox.provider,
          l1Provider: route.router.provider,
          epoch,
          epochPeriod: P,
          emitter,
          fetchBlocksAndCheckFinality,
        });

        expect(blocks).not.toBeNull();
        expect(l1ProvidersSeen).toEqual([route.router.provider]);
        expect(() => route.outbox.assertOwnBlock(blocks!.outboxBlock)).not.toThrow();
        expect(() => route.inbox.assertOwnBlock(blocks!.inboxBlock)).not.toThrow();
        expect(chiadoTags.length).toBeGreaterThan(0);
        expect(chiadoTags.filter((tag) => inRange(route.router, tag))).toEqual([]);
        // Chiado's own finalized block (its finality is healthy in both scenarios).
        expect(blocks!.outboxBlock).toBe(route.outbox.block("finalized").number);
      }
    );
  });

  describe("PRD 4.1 / [O4] (BR-6): deciding through an L1 finality stall", () => {
    it("decides from the newest Arbitrum block whose L1 batch has at least 64 confirmations and emits FINALITY_FALLBACK", async () => {
      const { route, fake, fetchBlocksAndCheckFinality } = setup({ stalledL1: true });
      const { events, emitter } = recordEmitter();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider: route.inbox.provider,
        outboxProvider: route.outbox.provider,
        l1Provider: route.router.provider,
        epoch: FALLBACK_EPOCH,
        epochPeriod: P,
        emitter,
        fetchBlocksAndCheckFinality,
      });

      expect(blocks).not.toBeNull();
      const inbox = route.inbox.block(blocks!.inboxBlock);
      const l1Head = route.router.block("latest").number;
      // Past (E+1)·P + sequencerDelayLimit, and newer than the stalled finalized block.
      expect(inbox.timestamp).toBeGreaterThanOrEqual((FALLBACK_EPOCH + 1) * P + SEQUENCER_DELAY_SECS);
      expect(blocks!.inboxBlock).toBeGreaterThan(route.inbox.block("finalized").number);
      // Its batch has >= 64 L1 confirmations; the next block's batch does not (it is the newest such block).
      const delivered = fake.deliveryBlock(fake.batchOf(blocks!.inboxBlock))!;
      expect(l1Head - delivered).toBeGreaterThanOrEqual(FALLBACK_L1_CONFIRMATIONS);
      const nextDelivered = fake.deliveryBlock(fake.batchOf(blocks!.inboxBlock + 1));
      expect(nextDelivered === undefined || l1Head - nextDelivered < FALLBACK_L1_CONFIRMATIONS).toBe(true);

      const fallback = events.find((e) => e[0] === BotEvents.FINALITY_FALLBACK);
      expect(fallback).toBeDefined();
      expect(fallback![1]).toEqual({
        epoch: FALLBACK_EPOCH,
        inboxBlock: inbox.number,
        inboxTimestamp: inbox.timestamp,
        l1Confirmations: l1Head - delivered,
      });
    });

    it("stays undecided while the fallback block is before (E+1)·P + sequencerDelayLimit", async () => {
      const { route, fetchBlocksAndCheckFinality } = setup({ stalledL1: true });
      const { events, emitter } = recordEmitter();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider: route.inbox.provider,
        outboxProvider: route.outbox.provider,
        l1Provider: route.router.provider,
        epoch: RECENT_EPOCH,
        epochPeriod: P,
        emitter,
        fetchBlocksAndCheckFinality,
      });

      expect(blocks).toBeNull();
      expect(events.some((e) => e[0] === BotEvents.FINALITY_FALLBACK)).toBe(false);
      const notSettled = events.find((e) => e[0] === BotEvents.EPOCH_NOT_SETTLED);
      expect(notSettled![3]).toBe((RECENT_EPOCH + 1) * P + SEQUENCER_DELAY_SECS);
    });

    it("stays undecided when no batch newer than the stalled finalized one has 64 confirmations", async () => {
      const { route, fake, fetchBlocksAndCheckFinality } = setup({ stalledL1: true });
      // Hide every delivery at depth >= 64 newer than the finalized block's batch.
      const l1Head = route.router.block("latest").number;
      fake.hideDelivery = (k) => {
        const at = fake.deliveryBlock(k);
        return (
          at !== undefined &&
          l1Head - at >= FALLBACK_L1_CONFIRMATIONS &&
          k > fake.batchOf(route.inbox.block("finalized").number)
        );
      };
      const { events, emitter } = recordEmitter();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider: route.inbox.provider,
        outboxProvider: route.outbox.provider,
        l1Provider: route.router.provider,
        epoch: FALLBACK_EPOCH,
        epochPeriod: P,
        emitter,
        fetchBlocksAndCheckFinality,
      });

      // The newest delivered batch at depth 64 is then the finalized block's own: still before the boundary.
      expect(blocks).toBeNull();
      expect(events.some((e) => e[0] === BotEvents.FINALITY_FALLBACK)).toBe(false);
    });

    it("refuses a fallback block whose batch has fewer than 64 L1 confirmations", async () => {
      const route = createTwoChainRoute({ now: NOW });
      const inboxBlock = route.inbox.block("latest");
      const { events, emitter } = recordEmitter();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider: route.inbox.provider,
        outboxProvider: route.outbox.provider,
        l1Provider: route.router.provider,
        epoch: FALLBACK_EPOCH,
        epochPeriod: P,
        emitter,
        fetchBlocksAndCheckFinality: jest.fn(async () => [
          route.inbox.block("finalized"),
          route.router.block("finalized"),
          false,
          true,
          { inboxBlock, l1Confirmations: FALLBACK_L1_CONFIRMATIONS - 1, sequencerDelayLimit: SEQUENCER_DELAY_SECS },
        ]) as any,
      });

      expect(blocks).toBeNull();
      expect(events.some((e) => e[0] === BotEvents.FINALITY_ISSUE)).toBe(true);
      expect(events.some((e) => e[0] === BotEvents.FINALITY_FALLBACK)).toBe(false);
    });

    it("an old epoch settled on finalized state stays decidable during the stall, with the outbox read at latest - 64", async () => {
      // Sepolia route: the outbox chain is Arbitrum's L1 itself, so its finality is the stalled one.
      const { route, fetchBlocksAndCheckFinality } = setup({ stalledL1: true });
      const oldEpoch = Math.floor((NOW - STALL_SECS - 1200) / P) - 2;
      const { emitter } = recordEmitter();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider: route.inbox.provider,
        outboxProvider: route.router.provider,
        epoch: oldEpoch,
        epochPeriod: P,
        emitter,
        fetchBlocksAndCheckFinality,
      });

      expect(blocks).toEqual({
        inboxBlock: route.inbox.block("finalized").number,
        outboxBlock: route.router.block("latest").number - 64,
      });
    });

    it("on the Sepolia route (no l1Provider) the fallback reads the stalled outbox at latest - 64", async () => {
      const { route, fetchBlocksAndCheckFinality } = setup({ stalledL1: true });
      const { emitter } = recordEmitter();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider: route.inbox.provider,
        outboxProvider: route.router.provider,
        epoch: FALLBACK_EPOCH,
        epochPeriod: P,
        emitter,
        fetchBlocksAndCheckFinality,
      });

      expect(blocks!.outboxBlock).toBe(route.router.block("latest").number - 64);
    });

    describe("getOutboxReadBlock", () => {
      it("returns the finalized block while the outbox chain's finality keeps up", async () => {
        const route = createTwoChainRoute({ now: NOW });
        expect(await getOutboxReadBlock({ outboxProvider: route.outbox.provider })).toEqual({
          number: route.outbox.block("finalized").number,
          timestamp: route.outbox.block("finalized").timestamp,
        });
      });

      it("returns latest - 64 once finalized is more than 1068 s behind latest, and alerts", async () => {
        const route = createTwoChainRoute({ now: NOW });
        route.outbox.options.finalizedLag = 214; // 1070 s behind on 5 s blocks
        const { events, emitter } = recordEmitter();

        const block = await getOutboxReadBlock({ outboxProvider: route.outbox.provider, emitter });

        expect(block.number).toBe(route.outbox.block("latest").number - 64);
        expect(block.timestamp).toBe(route.outbox.block(block.number).timestamp);
        expect(events.find((e) => e[0] === BotEvents.ALERT)![1]).toMatchObject({ code: "OUTBOX_FINALITY_STALLED" });
      });

      it("keeps the finalized block when the provider has no latest block to compare against", async () => {
        const finalized = { number: 15_000_100, timestamp: NOW - 160 };
        const provider: any = { getBlock: jest.fn(async (tag: any) => (tag === "finalized" ? finalized : null)) };
        expect(await getOutboxReadBlock({ outboxProvider: provider })).toEqual(finalized);
      });

      it("treats exactly 1068 s behind as no stall", async () => {
        const route = createTwoChainRoute({ now: NOW });
        route.router.options.finalizedLag = 89; // 1068 s on 12 s blocks
        const block = await getOutboxReadBlock({ outboxProvider: route.router.provider });
        expect(block.number).toBe(route.router.block("finalized").number);
      });
    });
  });

  describe("PRD 4.2 (BR-7): chain time, not the host clock", () => {
    afterEach(() => jest.restoreAllMocks());

    const runAll = async () => {
      const healthy = setup();
      const stalled = setup({ stalledL1: true });
      const { emitter } = recordEmitter();
      const gate = (s: ReturnType<typeof setup>, epoch: number) =>
        resolveSettledReadBlocks({
          inboxProvider: s.route.inbox.provider,
          outboxProvider: s.route.outbox.provider,
          l1Provider: s.route.router.provider,
          epoch,
          epochPeriod: P,
          emitter,
          fetchBlocksAndCheckFinality: s.fetchBlocksAndCheckFinality,
        });
      const check = (s: ReturnType<typeof setup>, epoch: number) =>
        getBlocksAndCheckFinality(s.route.router.provider, s.route.inbox.provider, epoch, P, emitter, s.deps);
      const outboxNow = healthy.route.outbox.block("latest").timestamp;
      return {
        healthyRecent: await gate(healthy, RECENT_EPOCH),
        healthyOld: await gate(healthy, CURRENT_EPOCH - 5),
        healthyCurrent: await gate(healthy, CURRENT_EPOCH),
        stalledFallback: await gate(stalled, FALLBACK_EPOCH),
        stalledRecent: await gate(stalled, RECENT_EPOCH),
        checkRecent: (await check(healthy, RECENT_EPOCH))!.slice(2),
        checkStalled: (await check(stalled, FALLBACK_EPOCH))!.slice(2, 4),
        outbox: await getOutboxReadBlock({ outboxProvider: healthy.route.outbox.provider, emitter }),
        range: setEpochRange({ chainId: 10200, currentTimestamp: outboxNow, epochPeriod: P }),
        challengeable: getLatestChallengeableEpoch(P, outboxNow * 1000),
      };
    };

    it("a host clock 30 minutes fast or slow changes no result", async () => {
      const spy = jest.spyOn(Date, "now");
      spy.mockReturnValue(NOW * 1000);
      const onTime = await runAll();
      spy.mockReturnValue((NOW + 1800) * 1000);
      const fast = await runAll();
      spy.mockReturnValue((NOW - 1800) * 1000);
      const slow = await runAll();

      expect(fast).toEqual(onTime);
      expect(slow).toEqual(onTime);
      // And the clock is not consulted at all.
      expect(spy).not.toHaveBeenCalled();
      // Sanity: the results are real decisions, not all-null.
      expect(onTime.healthyRecent).not.toBeNull();
      expect(onTime.stalledFallback).not.toBeNull();
      expect(onTime.stalledRecent).toBeNull();
      expect(onTime.healthyCurrent).toBeNull();
      expect(onTime.checkStalled).toEqual([false, true]);
      expect(onTime.range[onTime.range.length - 1]).toBe(CURRENT_EPOCH - 1);
    });
  });

  describe("PRD 2.3: a missing batch mapping is a flag, never a dereference", () => {
    it("finalized block not found on L1 while the latest one is: flags Arbitrum, does not throw", async () => {
      const { route, fake, deps } = setup();
      const finalized = route.inbox.block("finalized").number;
      fake.failBatchLookup = (n) => n === finalized;
      const { events, emitter } = recordEmitter();

      const result = await getBlocksAndCheckFinality(
        route.router.provider,
        route.inbox.provider,
        RECENT_EPOCH,
        P,
        emitter,
        deps
      );

      expect(result).toBeDefined();
      expect(result![2]).toBe(true);
      expect(events.some((e) => e[0] === BotEvents.FINALITY_ERROR && /finalized block is not found/.test(e[1]))).toBe(
        true
      );
    });

    it("latest block not found on L1 while the finalized one is: flags Arbitrum, does not throw", async () => {
      const { route, fake, deps } = setup();
      const finalizedBatch = fake.batchOf(route.inbox.block("finalized").number);
      fake.hideDelivery = (k) => k > finalizedBatch;
      const { events, emitter } = recordEmitter();

      const result = await getBlocksAndCheckFinality(
        route.router.provider,
        route.inbox.provider,
        RECENT_EPOCH,
        P,
        emitter,
        deps
      );

      expect(result).toBeDefined();
      expect(result![2]).toBe(true);
      expect(events.some((e) => e[0] === BotEvents.FINALITY_ERROR && /latest block is not found/.test(e[1]))).toBe(
        true
      );
    });

    it("neither found: undefined, which the gate turns into FINALITY_ISSUE", async () => {
      const { route, fake, fetchBlocksAndCheckFinality } = setup();
      fake.hideDelivery = () => true;
      const { events, emitter } = recordEmitter();

      const blocks = await resolveSettledReadBlocks({
        inboxProvider: route.inbox.provider,
        outboxProvider: route.outbox.provider,
        l1Provider: route.router.provider,
        epoch: RECENT_EPOCH,
        epochPeriod: P,
        emitter,
        fetchBlocksAndCheckFinality,
      });

      expect(blocks).toBeNull();
      expect(events.some((e) => e[0] === BotEvents.FINALITY_ISSUE)).toBe(true);
    });
  });

  describe("PRD 2.4: ArbBlockToL1Block with an unknown batch number", () => {
    const run = async (fake: FakeArbitrumL1, route: TwoChainRoute, fallbackLatest: boolean) =>
      ArbBlockToL1Block(
        fake.nodeInterface,
        fake.sequencer,
        route.inbox.block("finalized") as any,
        route.router.block("finalized").number - 7000,
        route.inbox.block("finalized").number - 1000,
        fallbackLatest,
        route.router.block("latest").number
      );

    it("returns undefined without scanning SequencerBatchDelivered when the lookup fails", async () => {
      const { route, fake } = setup();
      fake.failBatchLookup = () => true;

      expect(await run(fake, route, false)).toBeUndefined();
      expect(fake.l1Scans).toEqual([]);
    });

    it("returns undefined without scanning when the latest-batch fallback finds nothing either", async () => {
      const { route, fake } = setup();
      fake.failBatchLookup = () => true;

      expect(await run(fake, route, true)).toBeUndefined();
      expect(fake.l1Scans).toEqual([]);
    });

    it("maps a known batch to the L1 block that delivered it", async () => {
      const { route, fake } = setup();
      const finalized = route.inbox.block("finalized").number;

      const result = await run(fake, route, false);

      expect(result![0].number).toBe(fake.deliveryBlock(fake.batchOf(finalized)));
      expect(result![1]).toBe(finalized);
    });
  });

  describe("PRD 1.6 / [L7]: cold-start range", () => {
    it.each([
      [11155111, "testnet"],
      [10200, "testnet"],
    ])("chain %s %s covers the 7-day backlog and one challenge budget", (chainId, network) => {
      const config = getBridgeConfig(chainId);
      const epochPeriod = config.routeConfig[network as "testnet"].epochPeriod;
      const range = setEpochRange({ chainId, currentTimestamp: NOW, epochPeriod });
      const oldest = range[0] * epochPeriod;
      const budget = epochPeriod + config.sequencerDelayLimit + config.minChallengePeriod;

      expect(oldest).toBeLessThanOrEqual(NOW - 7 * 24 * 3600);
      expect(oldest).toBeLessThanOrEqual(NOW - budget);
      expect(range[range.length - 1]).toBe(Math.floor(NOW / epochPeriod) - 1);
    });

    it("a challenge budget longer than the backlog still bounds the range", () => {
      const epochPeriod = 3600;
      const sequencerDelayLimit = 86_400;
      const minChallengePeriod = 14 * 24 * 3600; // longer than 7 days + sync period
      const range = setEpochRange({
        chainId: 10200,
        currentTimestamp: NOW,
        epochPeriod,
        fetchBridgeConfig: (() => ({ sequencerDelayLimit, minChallengePeriod })) as any,
      });

      expect(range[0] * epochPeriod).toBeLessThanOrEqual(
        NOW - (epochPeriod + sequencerDelayLimit + minChallengePeriod)
      );
      expect(range[0] * epochPeriod).toBeLessThanOrEqual(NOW - 7 * 24 * 3600);
    });
  });
});
