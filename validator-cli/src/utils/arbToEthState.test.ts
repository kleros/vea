import {
  ArbBlockToL1Block,
  FALLBACK_L1_CONFIRMATIONS,
  getBlocksAndCheckFinality,
  getOutboxReadBlock,
  getSequencerDelaySeconds,
  resetOutboxStallAlerts,
  resolveSettledReadBlocks,
} from "./arbToEthState";
import { setEpochRange, getLatestChallengeableEpoch } from "./epochHandler";
import { BotEvents } from "./botEvents";
import { createTwoChainRoute, TwoChainRoute } from "../testUtils/twoChainFixture";
import { getBridgeConfig } from "../consts/bridgeRoutes";
import { createFakeArbitrumL1, FakeArbitrumL1, SEQUENCER_DELAY_SECS } from "../testUtils/fakeArbitrumL1";

// No test here reads a clock or sleeps; the timeout only lifts Jest's 5 s default, which a
// loaded machine can exceed, so the result never depends on speed.
jest.setTimeout(60_000);

const NOW = 1_760_000_000;
const P = 3600; // the Chiado testnet epoch period
const CURRENT_EPOCH = Math.floor(NOW / P);
// Decidable on finalized state: (E+1)·P is before the finalized Arbitrum block (~NOW - 1200).
const RECENT_EPOCH = Math.floor((NOW - 1200) / P) - 1;
// 30 hours of stalled L1 finality; Arbitrum's finalized block (which follows L1's) stalls with it.
const STALL_SECS = 30 * 3600;
// Decidable only through the stall fallback: (E+1)·P + sequencerDelayLimit is well before the fallback block.
const FALLBACK_EPOCH = Math.floor((NOW - SEQUENCER_DELAY_SECS - 3600) / P) - 1;

const recordEmitter = () => {
  const events: any[][] = [];
  return { events, emitter: { emit: (...args: any[]) => events.push(args) } as any };
};

const setup = ({ stalledL1 = false }: { stalledL1?: boolean } = {}) => {
  const route = createTwoChainRoute({ now: NOW });
  if (stalledL1) {
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
  const gate = (epoch: number, overrides: Record<string, unknown> = {}) =>
    resolveSettledReadBlocks({
      inboxProvider: route.inbox.provider,
      outboxProvider: route.outbox.provider,
      l1Provider: route.router.provider,
      epoch,
      epochPeriod: P,
      emitter: recordEmitter().emitter,
      fetchBlocksAndCheckFinality,
      ...overrides,
    });
  return { route, fake, deps, l1ProvidersSeen, fetchBlocksAndCheckFinality, gate };
};

const inRange = (chain: TwoChainRoute["router"], n: any) =>
  typeof n === "number" && n >= chain.options.firstBlock && n <= chain.options.headBlock;

describe("arbToEthState", () => {
  beforeEach(() => resetOutboxStallAlerts());

  it("reads delaySeconds out of the maxTimeVariation tuple, never coercing the whole tuple", async () => {
    const tuple: any = [7200, 64, 86400, 768];
    Object.assign(tuple, { delayBlocks: 7200, futureBlocks: 64, delaySeconds: 86400, futureSeconds: 768 });
    expect(await getSequencerDelaySeconds({ maxTimeVariation: jest.fn(async () => tuple) } as any)).toBe(86400);
  });

  describe("resolveSettledReadBlocks", () => {
    it.each([
      ["healthy L1", false, RECENT_EPOCH],
      ["stalled L1", true, FALLBACK_EPOCH],
    ])(
      "runs the finality check on Arbitrum's L1 and reads each chain at its own blocks (%s)",
      async (_n, stalledL1, epoch) => {
        const { route, l1ProvidersSeen, gate } = setup({ stalledL1 });
        const chiadoTags: any[] = [];
        const original = route.outbox.provider.getBlock;
        route.outbox.provider.getBlock = async (tag: any) => (chiadoTags.push(tag), original(tag));

        const blocks = await gate(epoch);

        expect(blocks).not.toBeNull();
        expect(l1ProvidersSeen).toEqual([route.router.provider]);
        expect(() => route.outbox.assertOwnBlock(blocks!.outboxBlock)).not.toThrow();
        expect(() => route.inbox.assertOwnBlock(blocks!.inboxBlock)).not.toThrow();
        // No Sepolia block number ever reaches the Chiado provider.
        expect(chiadoTags.filter((tag) => inRange(route.router, tag))).toEqual([]);
        expect(blocks!.outboxBlock).toBe(route.outbox.block("finalized").number);
      }
    );

    it("pins to the finalized inbox block and refuses one that predates (E+1)·P", async () => {
      const { route, gate } = setup();
      const settled = await gate(RECENT_EPOCH);
      expect(settled!.inboxBlock).toBe(route.inbox.block("finalized").number);
      expect(await gate(CURRENT_EPOCH)).toBeNull();
    });

    it("returns null with FINALITY_ISSUE when the finality check yields nothing or flags a chain", async () => {
      const { gate } = setup();
      const emitted: any[][] = [];
      const emitter: any = { emit: (...args: any[]) => emitted.push(args) };
      expect(
        await gate(RECENT_EPOCH, { emitter, fetchBlocksAndCheckFinality: jest.fn(async () => undefined) })
      ).toBeNull();
      expect(emitted.some((e) => e[0] === BotEvents.FINALITY_ISSUE)).toBe(true);
    });

    describe("through an L1 finality stall", () => {
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

        const inbox = route.inbox.block(blocks!.inboxBlock);
        const l1Head = route.router.block("latest").number;
        expect(inbox.timestamp).toBeGreaterThanOrEqual((FALLBACK_EPOCH + 1) * P + SEQUENCER_DELAY_SECS);
        expect(blocks!.inboxBlock).toBeGreaterThan(route.inbox.block("finalized").number);
        const delivered = fake.deliveryBlock(fake.batchOf(blocks!.inboxBlock))!;
        expect(l1Head - delivered).toBeGreaterThanOrEqual(FALLBACK_L1_CONFIRMATIONS);
        const nextDelivered = fake.deliveryBlock(fake.batchOf(blocks!.inboxBlock + 1));
        expect(nextDelivered === undefined || l1Head - nextDelivered < FALLBACK_L1_CONFIRMATIONS).toBe(true);
        expect(events.find((e) => e[0] === BotEvents.FINALITY_FALLBACK)![1]).toEqual({
          epoch: FALLBACK_EPOCH,
          inboxBlock: inbox.number,
          inboxTimestamp: inbox.timestamp,
          l1Confirmations: l1Head - delivered,
        });
      });

      it("stays undecided while the fallback block is before (E+1)·P + sequencerDelayLimit", async () => {
        const { gate } = setup({ stalledL1: true });
        expect(await gate(RECENT_EPOCH)).toBeNull();
      });

      it("refuses a fallback block whose batch has fewer than 64 L1 confirmations", async () => {
        const route = createTwoChainRoute({ now: NOW });
        const inboxBlock = route.inbox.block("latest");
        const blocks = await resolveSettledReadBlocks({
          inboxProvider: route.inbox.provider,
          outboxProvider: route.outbox.provider,
          l1Provider: route.router.provider,
          epoch: FALLBACK_EPOCH,
          epochPeriod: P,
          emitter: recordEmitter().emitter,
          fetchBlocksAndCheckFinality: jest.fn(async () => [
            route.inbox.block("finalized"),
            route.router.block("finalized"),
            false,
            true,
            { inboxBlock, l1Confirmations: FALLBACK_L1_CONFIRMATIONS - 1, sequencerDelayLimit: SEQUENCER_DELAY_SECS },
          ]) as any,
        });
        expect(blocks).toBeNull();
      });

      it("on the Sepolia route the stalled outbox is read at latest - 64", async () => {
        const { route, fetchBlocksAndCheckFinality } = setup({ stalledL1: true });
        const blocks = await resolveSettledReadBlocks({
          inboxProvider: route.inbox.provider,
          outboxProvider: route.router.provider,
          epoch: FALLBACK_EPOCH,
          epochPeriod: P,
          emitter: recordEmitter().emitter,
          fetchBlocksAndCheckFinality,
        });
        expect(blocks!.outboxBlock).toBe(route.router.block("latest").number - 64);
      });
    });
  });

  describe("getOutboxReadBlock", () => {
    it("returns the finalized block while the outbox chain's finality keeps up (exactly 1452 s behind is no stall)", async () => {
      const route = createTwoChainRoute({ now: NOW });
      expect((await getOutboxReadBlock({ outboxProvider: route.outbox.provider })).number).toBe(
        route.outbox.block("finalized").number
      );
      route.router.options.finalizedLag = 121; // 1452 s on 12 s blocks
      expect((await getOutboxReadBlock({ outboxProvider: route.router.provider })).number).toBe(
        route.router.block("finalized").number
      );
    });

    it("returns latest - 64 during a stall, alerting once per stall and once on recovery", async () => {
      const route = createTwoChainRoute({ now: NOW });
      const { events, emitter } = recordEmitter();
      const alerts = (code: string) => events.filter((e) => e[0] === BotEvents.ALERT && e[1]?.code === code);
      const read = () => getOutboxReadBlock({ outboxProvider: route.outbox.provider as any, emitter });

      route.outbox.options.finalizedLag = 300; // 1500 s behind on 5 s blocks
      for (let i = 0; i < 5; i++) {
        expect((await read()).number).toBe(route.outbox.block("latest").number - 64);
        route.outbox.advance(3);
      }
      expect(alerts("OUTBOX_FINALITY_STALLED")).toHaveLength(1);
      expect(alerts("OUTBOX_FINALITY_STALLED")[0][1]).toMatchObject({ level: "warn", chainId: 10200 });

      route.outbox.options.finalizedLag = 32;
      for (let i = 0; i < 3; i++) expect((await read()).number).toBe(route.outbox.block("finalized").number);
      expect(alerts("OUTBOX_FINALITY_RECOVERED")).toHaveLength(1);

      route.outbox.options.finalizedLag = 300;
      await read();
      expect(alerts("OUTBOX_FINALITY_STALLED")).toHaveLength(2);
    });

    it("works with a provider that has only getBlock, stalled or not, and with no latest block", async () => {
      const route = createTwoChainRoute({ now: NOW });
      const getBlockOnly: any = { getBlock: route.outbox.provider.getBlock };
      expect((await getOutboxReadBlock({ outboxProvider: getBlockOnly })).number).toBe(
        route.outbox.block("finalized").number
      );
      route.outbox.options.finalizedLag = 300;
      expect((await getOutboxReadBlock({ outboxProvider: getBlockOnly })).number).toBe(
        route.outbox.block("latest").number - 64
      );

      const finalized = { number: 15_000_100, timestamp: NOW - 160 };
      const noLatest: any = { getBlock: jest.fn(async (tag: any) => (tag === "finalized" ? finalized : null)) };
      expect(await getOutboxReadBlock({ outboxProvider: noLatest })).toEqual(finalized);
    });
  });

  it("decides from chain time only: a host clock 30 minutes fast or slow changes no result", async () => {
    const runAll = async () => {
      const healthy = setup();
      const stalled = setup({ stalledL1: true });
      const outboxNow = healthy.route.outbox.block("latest").timestamp;
      return {
        healthyRecent: await healthy.gate(RECENT_EPOCH),
        healthyCurrent: await healthy.gate(CURRENT_EPOCH),
        stalledFallback: await stalled.gate(FALLBACK_EPOCH),
        stalledRecent: await stalled.gate(RECENT_EPOCH),
        outbox: await getOutboxReadBlock({ outboxProvider: healthy.route.outbox.provider }),
        range: setEpochRange({ chainId: 10200, currentTimestamp: outboxNow, epochPeriod: P }),
        challengeable: getLatestChallengeableEpoch(P, outboxNow * 1000),
      };
    };
    const spy = jest.spyOn(Date, "now").mockReturnValue(NOW * 1000);
    try {
      const onTime = await runAll();
      spy.mockReturnValue((NOW + 1800) * 1000);
      expect(await runAll()).toEqual(onTime);
      spy.mockReturnValue((NOW - 1800) * 1000);
      expect(await runAll()).toEqual(onTime);
      expect(spy).not.toHaveBeenCalled();
      expect(onTime.healthyRecent).not.toBeNull();
      expect(onTime.stalledFallback).not.toBeNull();
      expect(onTime.stalledRecent).toBeNull();
      expect(onTime.healthyCurrent).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  describe("getBlocksAndCheckFinality", () => {
    it("flags Arbitrum instead of throwing when a block's L1 batch cannot be found", async () => {
      const { route, fake, deps } = setup();
      fake.failBatchLookup = (n) => n === route.inbox.block("finalized").number;
      const { events, emitter } = recordEmitter();

      const result = await getBlocksAndCheckFinality(
        route.router.provider,
        route.inbox.provider,
        RECENT_EPOCH,
        P,
        emitter,
        deps
      );

      expect(result![2]).toBe(true);
      expect(events.some((e) => e[0] === BotEvents.FINALITY_ERROR)).toBe(true);
    });

    it("returns undefined when neither the finalized nor the latest block is found on L1", async () => {
      const { route, fake, deps } = setup();
      fake.hideDelivery = () => true;
      expect(
        await getBlocksAndCheckFinality(
          route.router.provider,
          route.inbox.provider,
          RECENT_EPOCH,
          P,
          recordEmitter().emitter,
          deps
        )
      ).toBeUndefined();
    });
  });

  describe("ArbBlockToL1Block", () => {
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

    it("maps a known batch to the L1 block that delivered it", async () => {
      const { route, fake } = setup();
      const finalized = route.inbox.block("finalized").number;
      const result = await run(fake, route, false);
      expect(result![0].number).toBe(fake.deliveryBlock(fake.batchOf(finalized)));
      expect(result![1]).toBe(finalized);
    });

    it("returns undefined without an unfiltered SequencerBatchDelivered scan when the batch is unknown", async () => {
      const { route, fake } = setup();
      fake.failBatchLookup = () => true;
      expect(await run(fake, route, false)).toBeUndefined();
      expect(await run(fake, route, true)).toBeUndefined();
      expect(fake.l1Scans).toEqual([]);
    });
  });

  describe("setEpochRange", () => {
    it.each([[11155111], [10200]])("chain %s covers the 7-day backlog and one challenge budget", (chainId) => {
      const config = getBridgeConfig(chainId);
      const epochPeriod = config.routeConfig.testnet.epochPeriod;
      const range = setEpochRange({ chainId, currentTimestamp: NOW, epochPeriod });
      const oldest = range[0] * epochPeriod;
      const budget = epochPeriod + config.sequencerDelayLimit + config.minChallengePeriod;
      expect(oldest).toBeLessThanOrEqual(NOW - 7 * 24 * 3600);
      expect(oldest).toBeLessThanOrEqual(NOW - budget);
      expect(range[range.length - 1]).toBe(Math.floor(NOW / epochPeriod) - 1);
    });
  });
});
