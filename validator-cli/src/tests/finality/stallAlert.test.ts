/**
 * Run-001 #13 with [L19] (c), [L21] (a) and [L24] (c): `getOutboxReadBlock` alerts a chain's
 * finality stall once when it starts and once when it clears, keyed by `getNetwork().chainId`.
 *
 * Every test starts from `resetOutboxStallAlerts()`, so none depends on another's stall state
 * and the file passes in any order (`yarn jest --randomize`). Nothing here reads a clock.
 */
import { getOutboxReadBlock, resetOutboxStallAlerts } from "../../utils/arbToEthState";
import { BotEvents } from "../../utils/botEvents";
import { createTwoChainRoute, FakeChain } from "../../testUtils/twoChainFixture";

jest.setTimeout(60_000);

const NOW = 1_760_000_000;
// Chiado: 5 s blocks, healthy finalizedLag 32 (160 s); 214 blocks is 1070 s, past the 1068 s bound.
const CHIADO_STALL_LAG = 214;
// Sepolia: 12 s blocks, healthy finalizedLag 64; 100 blocks is 1200 s.
const SEPOLIA_STALL_LAG = 100;

const recordEmitter = () => {
  const events: any[][] = [];
  return { events, emitter: { emit: (...args: any[]) => events.push(args) } as any };
};

const alerts = (events: any[][], code: string) =>
  events.filter((e) => e[0] === BotEvents.ALERT && e[1]?.code === code).map((e) => e[1]);

/** The chain's provider with `getNetwork` counted. */
const countNetwork = (chain: FakeChain) => {
  const provider: any = { ...chain.provider };
  const getNetwork = jest.fn(chain.provider.getNetwork);
  provider.getNetwork = getNetwork;
  return { provider, getNetwork };
};

/** A provider with nothing but `getBlock`, backed by the chain. */
const getBlockOnly = (chain: FakeChain): any => ({ getBlock: chain.provider.getBlock });

describe("finality lane: run-001 #13, one outbox stall alert per stall and chain", () => {
  beforeEach(() => resetOutboxStallAlerts());

  it("repeated reads during one stall alert once; the clear alerts once; a new stall alerts again", async () => {
    const route = createTwoChainRoute({ now: NOW });
    const { events, emitter } = recordEmitter();
    const read = () => getOutboxReadBlock({ outboxProvider: route.outbox.provider as any, emitter });

    route.outbox.options.finalizedLag = CHIADO_STALL_LAG;
    for (let i = 0; i < 5; i++) {
      const block = await read();
      // Every stalled read still returns latest - 64.
      expect(block.number).toBe(route.outbox.block("latest").number - 64);
      route.outbox.advance(3); // the head keeps moving while finality stays stalled
    }
    expect(alerts(events, "OUTBOX_FINALITY_STALLED")).toHaveLength(1);
    expect(alerts(events, "OUTBOX_FINALITY_STALLED")[0]).toMatchObject({ level: "warn", chainId: 10200 });
    expect(alerts(events, "OUTBOX_FINALITY_RECOVERED")).toHaveLength(0);

    route.outbox.options.finalizedLag = 32;
    for (let i = 0; i < 3; i++) {
      expect((await read()).number).toBe(route.outbox.block("finalized").number);
    }
    expect(alerts(events, "OUTBOX_FINALITY_RECOVERED")).toHaveLength(1);
    expect(alerts(events, "OUTBOX_FINALITY_RECOVERED")[0]).toMatchObject({ chainId: 10200 });
    expect(alerts(events, "OUTBOX_FINALITY_STALLED")).toHaveLength(1);

    route.outbox.options.finalizedLag = CHIADO_STALL_LAG;
    await read();
    await read();
    expect(alerts(events, "OUTBOX_FINALITY_STALLED")).toHaveLength(2);
  });

  it("keys the stall by chain: two stalled chains alert once each and recover separately", async () => {
    const route = createTwoChainRoute({ now: NOW });
    const { events, emitter } = recordEmitter();
    route.outbox.options.finalizedLag = CHIADO_STALL_LAG;
    route.router.options.finalizedLag = SEPOLIA_STALL_LAG;

    for (let i = 0; i < 3; i++) {
      await getOutboxReadBlock({ outboxProvider: route.outbox.provider as any, emitter });
      await getOutboxReadBlock({ outboxProvider: route.router.provider as any, emitter });
    }
    expect(alerts(events, "OUTBOX_FINALITY_STALLED").map((a) => a.chainId)).toEqual([10200, 11155111]);

    route.router.options.finalizedLag = 64;
    for (let i = 0; i < 3; i++) {
      await getOutboxReadBlock({ outboxProvider: route.outbox.provider as any, emitter });
      await getOutboxReadBlock({ outboxProvider: route.router.provider as any, emitter });
    }
    expect(alerts(events, "OUTBOX_FINALITY_RECOVERED").map((a) => a.chainId)).toEqual([11155111]);
    expect(alerts(events, "OUTBOX_FINALITY_STALLED")).toHaveLength(2);
  });

  it("asks getNetwork only on a stall or while a chain is marked stalled", async () => {
    const route = createTwoChainRoute({ now: NOW });
    const { emitter } = recordEmitter();
    const outbox = countNetwork(route.outbox);

    await getOutboxReadBlock({ outboxProvider: outbox.provider, emitter });
    await getOutboxReadBlock({ outboxProvider: outbox.provider, emitter });
    expect(outbox.getNetwork).not.toHaveBeenCalled();

    route.outbox.options.finalizedLag = CHIADO_STALL_LAG;
    await getOutboxReadBlock({ outboxProvider: outbox.provider, emitter });
    expect(outbox.getNetwork).toHaveBeenCalledTimes(1);

    // Healthy again: asked once, to clear the mark, and not after that.
    route.outbox.options.finalizedLag = 32;
    await getOutboxReadBlock({ outboxProvider: outbox.provider, emitter });
    await getOutboxReadBlock({ outboxProvider: outbox.provider, emitter });
    expect(outbox.getNetwork).toHaveBeenCalledTimes(2);
  });

  it("a { getBlock }-only provider passes with no stall, even while another chain is marked stalled", async () => {
    const route = createTwoChainRoute({ now: NOW });
    const { events, emitter } = recordEmitter();
    const finalized = route.outbox.block("finalized");

    expect(await getOutboxReadBlock({ outboxProvider: getBlockOnly(route.outbox), emitter })).toEqual({
      number: finalized.number,
      timestamp: finalized.timestamp,
    });

    route.router.options.finalizedLag = SEPOLIA_STALL_LAG;
    await getOutboxReadBlock({ outboxProvider: route.router.provider as any, emitter });
    expect(await getOutboxReadBlock({ outboxProvider: getBlockOnly(route.outbox), emitter })).toEqual({
      number: finalized.number,
      timestamp: finalized.timestamp,
    });
    expect(alerts(events, "OUTBOX_FINALITY_RECOVERED")).toHaveLength(0);
  });

  it("a stalled { getBlock }-only provider returns latest - 64 and still alerts, without de-duplication", async () => {
    const route = createTwoChainRoute({ now: NOW });
    const { events, emitter } = recordEmitter();
    route.outbox.options.finalizedLag = CHIADO_STALL_LAG;

    const first = await getOutboxReadBlock({ outboxProvider: getBlockOnly(route.outbox), emitter });
    const second = await getOutboxReadBlock({ outboxProvider: getBlockOnly(route.outbox), emitter });

    expect(first.number).toBe(route.outbox.block("latest").number - 64);
    expect(second).toEqual(first);
    const stalled = alerts(events, "OUTBOX_FINALITY_STALLED");
    expect(stalled).toHaveLength(2);
    expect(stalled[0].chainId).toBeUndefined();
  });

  it.each([
    ["throws", async () => Promise.reject(new Error("network down"))],
    ["answers without a chain id", async () => ({ name: "unknown" })],
  ])("a getNetwork that %s skips the de-duplication and still returns the stall read block", async (_n, getNetwork) => {
    const route = createTwoChainRoute({ now: NOW });
    const { events, emitter } = recordEmitter();
    route.outbox.options.finalizedLag = CHIADO_STALL_LAG;
    const provider: any = { getBlock: route.outbox.provider.getBlock, getNetwork };

    const block = await getOutboxReadBlock({ outboxProvider: provider, emitter });

    expect(block.number).toBe(route.outbox.block("latest").number - 64);
    expect(alerts(events, "OUTBOX_FINALITY_STALLED")).toHaveLength(1);
    // Nothing was marked, so the healthy chain later has nothing to recover from.
    route.outbox.options.finalizedLag = 32;
    await getOutboxReadBlock({ outboxProvider: route.outbox.provider as any, emitter });
    expect(alerts(events, "OUTBOX_FINALITY_RECOVERED")).toHaveLength(0);
  });

  it("resetOutboxStallAlerts forgets the marked stall", async () => {
    const route = createTwoChainRoute({ now: NOW });
    const { events, emitter } = recordEmitter();
    route.outbox.options.finalizedLag = CHIADO_STALL_LAG;

    await getOutboxReadBlock({ outboxProvider: route.outbox.provider as any, emitter });
    resetOutboxStallAlerts();
    await getOutboxReadBlock({ outboxProvider: route.outbox.provider as any, emitter });
    expect(alerts(events, "OUTBOX_FINALITY_STALLED")).toHaveLength(2);

    resetOutboxStallAlerts();
    route.outbox.options.finalizedLag = 32;
    await getOutboxReadBlock({ outboxProvider: route.outbox.provider as any, emitter });
    expect(alerts(events, "OUTBOX_FINALITY_RECOVERED")).toHaveLength(0);
  });
});
