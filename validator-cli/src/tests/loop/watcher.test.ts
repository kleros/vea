jest.mock("../../utils/envValidation", () => ({ validateEnvironment: jest.fn() }));
jest.mock("../../utils/logger", () => ({ initialize: jest.fn() }));
jest.mock("../../utils/heartbeat", () => ({ sendHeartbeat: jest.fn() }));
jest.mock("../../utils/claim", () => ({ getClaim: jest.fn() }));
jest.mock("../../helpers/claimer", () => ({ checkAndClaim: jest.fn() }));
jest.mock("../../helpers/validator", () => ({ challengeAndResolveClaim: jest.fn() }));
jest.mock("../../helpers/snapshot", () => ({ saveSnapshot: jest.fn() }));
jest.mock("../../utils/ethers", () => ({
  getVeaInbox: jest.fn((address: string, _key: any, _p: any, chainId: number, network: string) => ({
    kind: "inbox",
    address,
    chainId,
    network,
  })),
  getVeaOutbox: jest.fn((address: string, _key: any, _p: any, chainId: number, network: string) => ({
    kind: "outbox",
    address,
    chainId,
    network,
  })),
}));
jest.mock("../../utils/fallbackProvider", () => ({ FallbackRpcProvider: jest.fn() }));
jest.mock("../../utils/fallbackProviderV5", () => ({ FallbackProviderV5: jest.fn() }));
jest.mock("../../utils/transactionHandlers", () => ({ getTransactionHandler: jest.fn() }));
jest.mock("../../consts/bridgeRoutes", () => {
  process.env.RPC_ARB = "https://arb.rpc.test";
  process.env.RPC_ETH = "https://eth.rpc.test";
  process.env.RPC_GNOSIS = "https://gnosis.rpc.test";
  return jest.requireActual("../../consts/bridgeRoutes");
});

import { BotEvents } from "../../utils/botEvents";
import { EpochOutcome } from "../../utils/epochOutcome";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { watch } from "../../watcher";
import { ShutdownSignal } from "../../utils/shutdown";
import { EventEmitter } from "events";
import { createTwoChainRoute } from "../../testUtils/twoChainFixture";
import { mocks, resetMocks, runWatcher, harness, FakeHandler, fakeClaim, reporting } from "./harness";

const GNOSIS = 10200;
const SEPOLIA = 11155111;
const P_GNOSIS = getBridgeConfig(GNOSIS).routeConfig[Network.TESTNET].epochPeriod; // 3600
const HOUR = 3600;

/** The [L5] window of a testnet route at chain time `now`. */
const windowOf = (chainId: number, now: number) => {
  const { routeConfig, sequencerDelayLimit, minChallengePeriod } = getBridgeConfig(chainId);
  const P = routeConfig[Network.TESTNET].epochPeriod;
  const B = P + sequencerDelayLimit + minChallengePeriod;
  return { low: Math.floor((now - B) / P) - 2, high: Math.floor(now / P) - 1 };
};

// The harness uses no host timers (chain time is the fixture's, the cycle wait is stubbed), so no
// assertion depends on machine speed; this bound only keeps a long multi-cycle run from failing
// when six lanes' suites share a loaded machine (run 001 timed out at Jest's default 5 s).
jest.setTimeout(120_000);

const savedArgv = process.argv;
const savedEnv = { ...process.env };
beforeEach(() => resetMocks());
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  process.argv = savedArgv;
  process.env = savedEnv;
});

describe("watcher: which epochs are watched ([L5], [L8])", () => {
  it("[L8](a) a cold-start epoch older than the window that throws on cycle 1 is passed to getClaim again on cycle 2", async () => {
    let target = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) => {
      if (epoch === target && harness().cycle() === 1) throw new Error("ClaimNotFoundError");
      return null;
    });
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 3,
      setup: (h) => {
        target = windowOf(GNOSIS, h.now(GNOSIS)).low - 20;
      },
    });
    expect(h.epochsOf("getClaim", 1)).toContain(target);
    expect(h.epochsOf("getClaim", 2)).toContain(target);
    expect(h.epochsOf("getClaim", 3)).toContain(target); // one null cycle after the throw is not enough
    expect(h.eventsNamed(BotEvents.EPOCH_FAILED)).toContainEqual(
      expect.objectContaining({ chainId: GNOSIS, network: "testnet", epoch: target })
    );
    // Its untroubled neighbour left after two null cycles.
    expect(h.epochsOf("getClaim", 3)).not.toContain(target - 1);
    expect(h.eventsNamed(BotEvents.EPOCH_DROPPED)).toContainEqual({
      chainId: GNOSIS,
      network: "testnet",
      epoch: target - 1,
      reason: "no_claim",
    });
  });

  it("[L8](a) per route: a route that fails on cycle 1 examines its cold-start epochs on cycle 2", async () => {
    let target = 0;
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 2,
      setup: (h) => {
        target = windowOf(GNOSIS, h.now(GNOSIS)).low - 20;
        h.failOutbox(GNOSIS, () => h.cycle() === 1);
      },
    });
    expect(h.epochsOf("getClaim", 1)).toEqual([]);
    expect(h.eventsNamed(BotEvents.ROUTE_FAILED)).toHaveLength(1);
    expect(h.epochsOf("getClaim", 2)).toContain(target);
  });

  it("[L8] a route failure before an older epoch is examined breaks its run of null cycles", async () => {
    let target = 0;
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 5,
      setup: (h) => {
        target = windowOf(GNOSIS, h.now(GNOSIS)).low - 20;
        h.failOutbox(GNOSIS, () => h.cycle() === 2);
      },
    });
    // cycle 1 null, cycle 2 route failed, cycles 3 and 4 null: leaves after cycle 4, not after 3.
    expect(h.epochsOf("getClaim", 3)).toContain(target);
    expect(h.epochsOf("getClaim", 4)).toContain(target);
    expect(h.epochsOf("getClaim", 5)).not.toContain(target);
  });

  it("[L8](b) --path=challenger: a claim on cycle 1 and null afterwards leaves after two null cycles and its handler key goes", async () => {
    let target = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) =>
      epoch === target && harness().cycle() === 1 ? fakeClaim(harness().now(GNOSIS) - HOUR) : null
    );
    mocks.challengeAndResolveClaim.mockImplementation(async ({ transactionHandler }: any) => transactionHandler);
    const key = () => `${GNOSIS}_testnet_${target}`;
    const seen: boolean[] = [];
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 4,
      setup: (h) => {
        target = windowOf(GNOSIS, h.now(GNOSIS)).low - 10;
      },
      beforeCycle: (_c, h) => {
        seen.push(key() in h.state.transactionHandlers);
      },
    });
    expect(mocks.checkAndClaim).not.toHaveBeenCalled();
    expect(h.calls.filter((c) => c.fn === "challengeAndResolveClaim").map((c) => c.epoch)).toEqual([target]);
    expect(h.epochsOf("getClaim", 2)).toContain(target);
    expect(h.epochsOf("getClaim", 3)).toContain(target);
    expect(h.epochsOf("getClaim", 4)).not.toContain(target);
    expect(seen).toEqual([false, true, true, false]); // before cycles 1..4: built on cycle 1, removed after cycle 3
    expect(key() in h.state.transactionHandlers).toBe(false);
    expect(h.eventsNamed(BotEvents.EPOCH_DROPPED)).toContainEqual({
      chainId: GNOSIS,
      network: "testnet",
      epoch: target,
      reason: "no_claim",
    });
  });

  it("[L8] a reported PENDING keeps an older epoch with no claim; it leaves two null cycles after the last PENDING", async () => {
    let target = 0;
    mocks.checkAndClaim.mockImplementation(
      reporting(({ epoch }) => (epoch === target && harness().cycle() <= 3 ? EpochOutcome.PENDING : undefined))
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 6,
      setup: (h) => {
        target = windowOf(GNOSIS, h.now(GNOSIS)).low - 3;
      },
    });
    for (const cycle of [1, 2, 3, 4, 5]) expect(h.epochsOf("checkAndClaim", cycle)).toContain(target);
    expect(h.epochsOf("checkAndClaim", 6)).not.toContain(target);
  });

  it("[L8] UNDECIDABLE also keeps an older epoch with no claim", async () => {
    let target = 0;
    mocks.checkAndClaim.mockImplementation(
      reporting(({ epoch }) => (epoch === target ? EpochOutcome.UNDECIDABLE : undefined))
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 4,
      setup: (h) => {
        target = windowOf(GNOSIS, h.now(GNOSIS)).low - 3;
      },
    });
    expect(h.epochsOf("checkAndClaim", 4)).toContain(target);
  });

  it("[L8] an explicit DONE lets an older claimed epoch leave at once; a claim with no report keeps it", async () => {
    let done = 0;
    let silent = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) =>
      epoch === done || epoch === silent ? fakeClaim(harness().now(GNOSIS) - HOUR) : null
    );
    mocks.challengeAndResolveClaim.mockImplementation(
      reporting(({ epoch }) => (epoch === done ? EpochOutcome.DONE : undefined))
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 4,
      setup: (h) => {
        done = windowOf(GNOSIS, h.now(GNOSIS)).low - 5;
        silent = done - 1;
      },
    });
    expect(h.epochsOf("getClaim", 1)).toContain(done);
    expect(h.epochsOf("getClaim", 2)).not.toContain(done);
    expect(h.eventsNamed(BotEvents.EPOCH_DROPPED)).toContainEqual({
      chainId: GNOSIS,
      network: "testnet",
      epoch: done,
      reason: "done",
    });
    expect(h.epochsOf("getClaim", 4)).toContain(silent);
  });

  it("[L8] mergeOutcomes: one helper's DONE does not drop an epoch the other reports PENDING", async () => {
    let target = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) =>
      epoch === target ? fakeClaim(harness().now(GNOSIS) - HOUR) : null
    );
    mocks.challengeAndResolveClaim.mockImplementation(
      reporting(({ epoch }) => (epoch === target ? EpochOutcome.DONE : undefined))
    );
    mocks.checkAndClaim.mockImplementation(
      reporting(({ epoch }) => (epoch === target ? EpochOutcome.PENDING : undefined))
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "both",
      cycles: 3,
      setup: (h) => {
        target = windowOf(GNOSIS, h.now(GNOSIS)).low - 5;
      },
    });
    expect(h.epochsOf("getClaim", 3)).toContain(target);
    expect(h.eventsNamed(BotEvents.EPOCH_DROPPED).map((p) => p.epoch)).not.toContain(target);
  });

  it("[L2] a helper that returns a handler without reporting keeps an older epoch with no claim", async () => {
    let target = 0;
    mocks.checkAndClaim.mockImplementation(async ({ epoch, transactionHandler }: any) =>
      epoch === target ? transactionHandler : null
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 4,
      setup: (h) => {
        target = windowOf(GNOSIS, h.now(GNOSIS)).low - 3;
      },
    });
    expect(h.epochsOf("checkAndClaim", 4)).toContain(target);
  });

  it("[L14] the keep rule for an older epoch: kept on a claim, a throw, PENDING, UNDECIDABLE or a returned handler without a report; leaves after two null cycles otherwise", async () => {
    // One older epoch per keep condition, each holding it on cycles 1-3 only; `plain` has none.
    const ids = ["claim", "throw", "pending", "undecidable", "handler", "handlerDone", "plain"] as const;
    const E: Record<string, number> = {};
    const active = (name: string, epoch: number) => epoch === E[name] && harness().cycle() <= 3;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) => {
      if (active("throw", epoch)) throw new Error("rpc failed");
      return active("claim", epoch) ? fakeClaim(harness().now(GNOSIS) - HOUR) : null;
    });
    mocks.checkAndClaim.mockImplementation(
      reporting(
        ({ epoch }) =>
          active("pending", epoch)
            ? EpochOutcome.PENDING
            : active("undecidable", epoch)
            ? EpochOutcome.UNDECIDABLE
            : active("handlerDone", epoch)
            ? EpochOutcome.DONE
            : undefined,
        ({ epoch, transactionHandler }) =>
          active("handler", epoch) || active("handlerDone", epoch) ? transactionHandler : null
      )
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "both",
      cycles: 6,
      setup: (h) => {
        const low = windowOf(GNOSIS, h.now(GNOSIS)).low;
        ids.forEach((name, i) => (E[name] = low - 3 - i));
      },
    });
    const kept = ["claim", "throw", "pending", "undecidable", "handler"];
    for (const name of kept) {
      // Held on cycles 1-3, then two null cycles (4, 5): examined through cycle 5, gone on 6.
      const watched = [1, 2, 3, 4, 5, 6].map((cycle) => h.epochsOf("getClaim", cycle).includes(E[name]));
      expect({ name, watched }).toEqual({ name, watched: [true, true, true, true, true, false] });
    }
    // A returned handler with an explicit DONE leaves at once; with no keep condition, after two null cycles.
    expect(h.epochsOf("getClaim", 1)).toContain(E.handlerDone);
    expect(h.epochsOf("getClaim", 2)).not.toContain(E.handlerDone);
    expect(h.epochsOf("getClaim", 2)).toContain(E.plain);
    expect(h.epochsOf("getClaim", 3)).not.toContain(E.plain);
    const dropped = h.eventsNamed(BotEvents.EPOCH_DROPPED);
    expect(dropped).toContainEqual({ chainId: GNOSIS, network: "testnet", epoch: E.handlerDone, reason: "done" });
    for (const name of [...kept, "plain"]) {
      expect(dropped).toContainEqual({ chainId: GNOSIS, network: "testnet", epoch: E[name], reason: "no_claim" });
    }
  });

  it("[L8](c) a devnet route calls checkAndClaim for exactly one epoch per cycle, floor(now / P)", async () => {
    const P = getBridgeConfig(GNOSIS).routeConfig[Network.DEVNET].epochPeriod;
    const expected: number[] = [];
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "devnet",
      path: "both",
      cycles: 4,
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(P);
        expected.push(Math.floor(h.now(GNOSIS) / P));
      },
    });
    for (const cycle of [1, 2, 3, 4]) expect(h.epochsOf("checkAndClaim", cycle)).toEqual([expected[cycle - 1]]);
    expect(h.eventsNamed(BotEvents.EPOCH_DROPPED)).toContainEqual({
      chainId: GNOSIS,
      network: "devnet",
      epoch: expected[0],
      reason: "devnet_rollover",
    });
    expect(Object.keys(h.state.transactionHandlers)).toEqual([`${GNOSIS}_devnet_${expected[3]}`]);
  });

  it("[L5] a route that fails for cycles covering three epochs examines each of them once it recovers", async () => {
    const missed: number[] = [];
    const h = await runWatcher({
      chains: `${GNOSIS},${SEPOLIA}`,
      networks: "testnet",
      path: "challenger",
      cycles: 5,
      setup: (h) => h.failOutbox(GNOSIS, () => h.cycle() >= 2 && h.cycle() <= 4),
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(P_GNOSIS);
        if (cycle >= 2 && cycle <= 4) missed.push(Math.floor(h.now(GNOSIS) / P_GNOSIS) - 1);
      },
    });
    expect(new Set(missed).size).toBe(3);
    expect(h.eventsNamed(BotEvents.ROUTE_FAILED)).toHaveLength(3);
    for (const epoch of missed) expect(h.epochsOf("getClaim", 5, GNOSIS)).toContain(epoch);
    // The other route ran in every cycle.
    for (const cycle of [1, 2, 3, 4, 5]) expect(h.epochsOf("getClaim", cycle, SEPOLIA).length).toBeGreaterThan(0);
  });

  it("[L5]/BR-3 a claim that reaches the outbox read block only after (E+2)·P is still examined and passed to the challenger", async () => {
    let E = 0;
    let visibleFrom = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) =>
      epoch === E && harness().now(GNOSIS) >= visibleFrom ? fakeClaim((E + 2) * P_GNOSIS - 60) : null
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 6,
      setup: (h) => {
        E = Math.floor(h.now(GNOSIS) / P_GNOSIS) - 1;
        visibleFrom = (E + 2) * P_GNOSIS + 15 * 60;
      },
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(HOUR / 2);
      },
    });
    const challenged = h.calls.filter((c) => c.fn === "challengeAndResolveClaim" && c.epoch === E);
    expect(challenged.length).toBeGreaterThan(0);
    expect(challenged[0].params.claim).not.toBeNull();
  });

  it("[L5] an unclaimed epoch leaves once it ages out of the window, not before", async () => {
    let E = 0;
    let lastInWindow = 0;
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 40,
      setup: (h) => {
        E = Math.floor(h.now(GNOSIS) / P_GNOSIS) - 1;
      },
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(HOUR);
        if (windowOf(GNOSIS, h.now(GNOSIS)).low <= E) lastInWindow = cycle;
      },
    });
    for (let cycle = 1; cycle <= lastInWindow; cycle++) expect(h.epochsOf("getClaim", cycle)).toContain(E);
    expect(lastInWindow).toBeLessThan(40);
    // Aged out with a long run of null cycles: examined once more as an older epoch, then gone.
    expect(h.epochsOf("getClaim", lastInWindow + 1)).toContain(E);
    expect(h.epochsOf("getClaim", lastInWindow + 2)).not.toContain(E);
    expect(h.eventsNamed(BotEvents.EPOCH_DROPPED)).toContainEqual({
      chainId: GNOSIS,
      network: "testnet",
      epoch: E,
      reason: "no_claim",
    });
  });
});

describe("watcher: failures are contained (PRD 2.1, BR-4)", () => {
  it("a throw while processing one epoch does not stop the route's other epochs; the epoch stays watched", async () => {
    let bad = 0;
    mocks.checkAndClaim.mockImplementation(async ({ epoch }: any) => {
      if (epoch === bad) throw new Error("execution reverted at https://rpc.example/v3/KEY");
      return null;
    });
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 2,
      setup: (h) => {
        bad = Math.floor(h.now(GNOSIS) / P_GNOSIS) - 1; // the newest epoch, processed first
      },
    });
    const cycle1 = h.epochsOf("checkAndClaim", 1);
    expect(cycle1[0]).toBe(bad);
    expect(cycle1.length).toBeGreaterThan(1);
    expect(h.epochsOf("checkAndClaim", 2)).toContain(bad);
    const failed = h.eventsNamed(BotEvents.EPOCH_FAILED);
    expect(failed[0]).toEqual({
      chainId: GNOSIS,
      network: "testnet",
      epoch: bad,
      message: expect.stringContaining("checkAndClaim"),
    });
    expect(JSON.stringify(failed)).not.toContain("rpc.example");
  });

  it("a challenger throw does not stop the claimer's work on the same epoch", async () => {
    let E = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) => (epoch === E ? fakeClaim(1) : null));
    mocks.challengeAndResolveClaim.mockRejectedValue(new Error("boom"));
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "both",
      cycles: 1,
      setup: (h) => {
        E = Math.floor(h.now(GNOSIS) / P_GNOSIS) - 1;
      },
    });
    expect(h.epochsOf("checkAndClaim", 1)).toContain(E);
  });

  it("a throw on one route does not stop the other route's epoch in the same cycle", async () => {
    const h = await runWatcher({
      chains: `${GNOSIS},${SEPOLIA}`,
      networks: "testnet",
      path: "both",
      cycles: 2,
      setup: (h) => h.failOutbox(GNOSIS, () => true),
    });
    expect(h.eventsNamed(BotEvents.ROUTE_FAILED)).toEqual([
      { chainId: GNOSIS, network: "testnet", message: expect.any(String) },
      { chainId: GNOSIS, network: "testnet", message: expect.any(String) },
    ]);
    expect(JSON.stringify(h.eventsNamed(BotEvents.ROUTE_FAILED))).not.toMatch(/rpc\.test|secret-key/);
    const sepoliaEpoch = Math.floor(h.now(SEPOLIA) / 7200) - 1;
    expect(h.epochsOf("checkAndClaim", 1, SEPOLIA)).toContain(sepoliaEpoch);
    expect(h.epochsOf("checkAndClaim", 2, SEPOLIA)).toContain(sepoliaEpoch);
  });
});

describe("watcher: handlers ([L10], [L9], PRD 1.2, 3.4, 3.5)", () => {
  it("[L10] on 10200 --path=both the handler challengeAndResolveClaim gets carries the Sepolia router provider", async () => {
    let E = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) =>
      epoch === E && harness().cycle() >= 2 ? fakeClaim(harness().now(GNOSIS)) : null
    );
    mocks.checkAndClaim.mockImplementation(async ({ epoch, transactionHandler }: any) =>
      epoch === E && harness().cycle() === 1 ? transactionHandler : null
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "both",
      cycles: 2,
      setup: (h) => {
        E = Math.floor(h.now(GNOSIS) / P_GNOSIS) - 1;
      },
    });
    const claimed = h.calls.find((c) => c.fn === "checkAndClaim" && c.epoch === E && c.cycle === 1)!;
    const challenged = h.calls.find((c) => c.fn === "challengeAndResolveClaim" && c.epoch === E && c.cycle === 2)!;
    expect(challenged).toBeDefined();
    const handler = challenged.params.transactionHandler;
    expect(handler).toBeInstanceOf(FakeHandler);
    expect(handler.veaRouterProvider.name).toBe("sepolia");
    expect(handler.veaRouterProvider).toBe(challenged.params.veaRouterProvider);
    expect(handler.veaOutboxProvider.name).toBe("chiado");
    expect(handler.veaInboxProvider.name).toBe("arbitrum-sepolia");
    expect(handler).toBe(claimed.params.transactionHandler);
    // Built once for the epoch, with every field [L10] lists.
    expect(FakeHandler.built.filter((b) => b.opts.epoch === E)).toHaveLength(1);
    expect(handler.opts).toEqual(
      expect.objectContaining({ chainId: GNOSIS, network: "testnet", epoch: E, emitter: expect.anything() })
    );
    expect(handler.opts.veaInbox).toEqual(expect.objectContaining({ kind: "inbox" }));
    expect(handler.opts.veaOutbox).toEqual(expect.objectContaining({ kind: "outbox" }));
    // The same handler goes into checkAndClaim on cycle 2 too.
    const claimed2 = h.calls.find((c) => c.fn === "checkAndClaim" && c.epoch === E && c.cycle === 2)!;
    expect(claimed2.params.transactionHandler).toBe(handler);
    expect(h.state.transactionHandlers[`${GNOSIS}_testnet_${E}`]).toBe(handler);
  });

  it("PRD 1.2 checkAndClaim receives veaRouterProvider, reportOutcome and no `now` ([L9])", async () => {
    const h = await runWatcher({ chains: `${GNOSIS}`, networks: "testnet", path: "claimer", cycles: 1 });
    const params = h.calls.find((c) => c.fn === "checkAndClaim")!.params;
    expect(params.veaRouterProvider.name).toBe("sepolia");
    expect(typeof params.reportOutcome).toBe("function");
    expect("now" in params).toBe(false);
  });

  it("[L9] the snapshot handler is cached under its own key; checkAndClaim for E gets the claim handler after a snapshot was saved in E", async () => {
    const P = getBridgeConfig(GNOSIS).routeConfig[Network.DEVNET].epochPeriod;
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "devnet",
      path: "claimer",
      saveSnapshot: true,
      cycles: 2,
    });
    const E = Math.floor(h.now(GNOSIS) / P);
    const saves = h.calls.filter((c) => c.fn === "saveSnapshot");
    const claims = h.calls.filter((c) => c.fn === "checkAndClaim");
    expect(saves).toHaveLength(2);
    const snapshotHandler = saves[0].params.transactionHandler;
    expect(saves[1].params.transactionHandler).toBe(snapshotHandler); // same key for store and lookup
    expect(saves[0].params.now).toBe(h.now(GNOSIS));
    expect(claims.map((c) => c.epoch)).toEqual([E, E]);
    expect(claims[0].params.transactionHandler).not.toBe(snapshotHandler);
    expect(h.state.transactionHandlers[`snapshot_${GNOSIS}_devnet_${E}`]).toBe(snapshotHandler);
    expect(h.state.transactionHandlers[`${GNOSIS}_devnet_${E}`]).toBe(claims[0].params.transactionHandler);
  });

  it("[L9] on testnet a snapshot saved in E does not become E's claim handler in the next epoch", async () => {
    let E = 0;
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      saveSnapshot: true,
      cycles: 2,
      setup: (h) => {
        E = Math.floor(h.now(GNOSIS) / P_GNOSIS);
      },
      beforeCycle: (cycle, h) => {
        if (cycle === 2) h.advance(HOUR);
      },
    });
    const snapshotHandler = h.calls.find((c) => c.fn === "saveSnapshot" && c.cycle === 1)!.params.transactionHandler;
    expect(snapshotHandler.opts.epoch).toBe(E);
    const claimForE = h.calls.find((c) => c.fn === "checkAndClaim" && c.cycle === 2 && c.epoch === E)!;
    expect(claimForE.params.transactionHandler).not.toBe(snapshotHandler);
    expect(claimForE.params.transactionHandler.opts.epoch).toBe(E);
    // The stale snapshot key of E is gone once E+1 is current.
    expect(Object.keys(h.state.transactionHandlers).filter((k) => k.startsWith("snapshot_"))).toEqual([
      `snapshot_${GNOSIS}_testnet_${E + 1}`,
    ]);
  });

  it("PRD 3.5 two devnet routes with the same epoch period never share a handler", async () => {
    const h = await runWatcher({ chains: `${GNOSIS},${SEPOLIA}`, networks: "devnet", path: "claimer", cycles: 1 });
    const [a, b] = h.calls.filter((c) => c.fn === "checkAndClaim");
    expect(a.epoch).toBe(b.epoch);
    expect(a.params.transactionHandler).not.toBe(b.params.transactionHandler);
    expect(Object.keys(h.state.transactionHandlers).sort()).toEqual(
      [`${GNOSIS}_devnet_${a.epoch}`, `${SEPOLIA}_devnet_${a.epoch}`].sort()
    );
  });
});

describe("watcher: chain time (PRD 4.2, BR-7)", () => {
  it.each([+2 * HOUR, -2 * HOUR])("ignores a host clock off by %i s", async (skew) => {
    let chainNow = 0;
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 1,
      setup: (h) => {
        chainNow = h.now(GNOSIS);
        jest.spyOn(Date, "now").mockReturnValue((chainNow + skew) * 1000);
      },
    });
    const epochs = h.epochsOf("checkAndClaim", 1);
    expect(Math.max(...epochs)).toBe(Math.floor(chainNow / P_GNOSIS) - 1);
    const w = windowOf(GNOSIS, chainNow);
    for (let e = w.low; e <= w.high; e++) expect(epochs).toContain(e);
  });
});

describe("watcher: undecidable alert ([G5], [L3])", () => {
  const undecidableRun = async (
    startOffset: number,
    cycles: number,
    throwOn: number[] = [],
    clearOn: number[] = []
  ) => {
    let E = 0;
    mocks.checkAndClaim.mockImplementation(async (params: any) => {
      if (params.epoch !== E) return null;
      const cycle = harness().cycle();
      if (throwOn.includes(cycle)) throw new Error("settled read failed");
      params.reportOutcome(clearOn.includes(cycle) ? EpochOutcome.PENDING : EpochOutcome.UNDECIDABLE);
      return null;
    });
    // Chain time starts `startOffset` s after (E+1)·P.
    const base = Math.floor(1_760_000_000 / P_GNOSIS) * P_GNOSIS;
    E = base / P_GNOSIS - 1;
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles,
      now: base + startOffset,
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(120);
      },
    });
    return { h, E, alerts: h.eventsNamed(BotEvents.ALERT).filter((a) => a.code === "epoch_undecidable") };
  };

  it("15 undecidable cycles inside the first hour after (E+1)·P do not alert", async () => {
    const { alerts } = await undecidableRun(60, 15);
    expect(alerts).toHaveLength(0);
  });

  it("counts throws and UNDECIDABLE reports, alerts at 15 and again at 30", async () => {
    const { alerts, E } = await undecidableRun(HOUR, 30, [3, 15, 22]);
    expect(alerts).toEqual([
      expect.objectContaining({ code: "epoch_undecidable", chainId: GNOSIS, network: "testnet", epoch: E }),
      expect.objectContaining({ code: "epoch_undecidable", epoch: E }),
    ]);
    expect(alerts.map((a) => a.details.consecutiveCycles)).toEqual([15, 30]);
  });

  it("only counts cycles from (E+1)·P + 3600 s on", async () => {
    // Starts 30 cycles x 120 s before the threshold... first 30 cycles do not count; 15 more do.
    const { alerts } = await undecidableRun(HOUR - 29 * 120, 44);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].details.consecutiveCycles).toBe(15);
  });

  it("a decided cycle resets the count", async () => {
    const { alerts } = await undecidableRun(HOUR, 20, [], [10]);
    expect(alerts).toHaveLength(0);
  });
});

describe("watcher: liveness alarm ([G4], [L4], [L6])", () => {
  const SIX_HOURS = 6 * HOUR;

  it("[L6] no claims at all: exactly one alarm 24 h of chain time after the first cycle, then one per 24 h", async () => {
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 9,
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(SIX_HOURS);
      },
    });
    const alarms = h.eventsNamed(BotEvents.LIVENESS_ALARM);
    expect(alarms).toEqual([
      { chainId: GNOSIS, network: "testnet", secondsSinceLastClaim: 24 * HOUR },
      { chainId: GNOSIS, network: "testnet", secondsSinceLastClaim: 48 * HOUR },
    ]);
    expect(h.events.filter((e) => e.name === BotEvents.LIVENESS_ALARM).map((e) => e.cycle)).toEqual([5, 9]);
  });

  it("[L4] several idle cycles after the newest fetched claim emit exactly one alarm", async () => {
    let claimedAt = 0;
    let claimEpoch = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) => (epoch === claimEpoch ? fakeClaim(claimedAt) : null));
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 20,
      setup: (h) => {
        claimedAt = h.now(GNOSIS) - 20 * HOUR;
        claimEpoch = Math.floor(claimedAt / P_GNOSIS) - 1;
      },
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(HOUR);
      },
    });
    const alarms = h.eventsNamed(BotEvents.LIVENESS_ALARM);
    expect(alarms).toEqual([{ chainId: GNOSIS, network: "testnet", secondsSinceLastClaim: 24 * HOUR }]);
    // 24 h after the claim is cycle 5 (20 h + 4 h).
    expect(h.events.filter((e) => e.name === BotEvents.LIVENESS_ALARM).map((e) => e.cycle)).toEqual([5]);
  });

  it("a newer claim moves the baseline", async () => {
    let fresh = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) =>
      epoch === fresh ? fakeClaim(fresh * P_GNOSIS + P_GNOSIS + 60) : null
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "challenger",
      cycles: 5,
      setup: (h) => {
        fresh = Math.floor(h.now(GNOSIS) / P_GNOSIS) + 2; // claimed in ~3 h of chain time
      },
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(SIX_HOURS);
      },
    });
    // Without the claim the alarm would fire on cycle 5 (+24 h, see the [L6] test); the claim at ~+3 h defers it.
    expect(h.eventsNamed(BotEvents.LIVENESS_ALARM)).toEqual([]);
  });

  it("devnet routes never raise the alarm", async () => {
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "devnet",
      path: "challenger",
      cycles: 9,
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(SIX_HOURS);
      },
    });
    expect(h.eventsNamed(BotEvents.LIVENESS_ALARM)).toEqual([]);
  });
});

describe("watcher: heartbeat and shutdown (PRD 1.5, 4.7)", () => {
  it("sends started after validateEnvironment, running each cycle and stopped on exit", async () => {
    const order: string[] = [];
    mocks.validateEnvironment.mockImplementation(async () => {
      order.push("validateEnvironment");
      return { signerAddress: "0x", chainIds: [], networks: [], warnings: [] };
    });
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      cycles: 3,
      setup: () => {
        const impl = mocks.sendHeartbeat.getMockImplementation();
        mocks.sendHeartbeat.mockImplementation(async (status: string, ...rest: any[]) => {
          order.push(status);
          return impl?.(status, ...rest);
        });
      },
    });
    expect(h.cycle()).toBe(4);
    expect(order).toEqual(["validateEnvironment", "started", "running", "running", "running", "running", "stopped"]);
    expect(mocks.sendHeartbeat.mock.calls[0][1]).toBe("https://heartbeat.test/ping");
  });

  it("sends no heartbeat when validateEnvironment throws", async () => {
    mocks.validateEnvironment.mockRejectedValue(new Error("bad env"));
    await expect(watch(new ShutdownSignal(), undefined, { cycleDelayMs: 0 })).rejects.toThrow("bad env");
    expect(mocks.sendHeartbeat).not.toHaveBeenCalled();
  });

  const newListener = (signal: NodeJS.Signals, before: Function[]) =>
    process.listeners(signal).find((l) => !before.includes(l)) as (s: NodeJS.Signals) => void;

  it("SIGTERM during the cycle wait wakes it up; the watcher exits, sends stopped and removes its handlers", async () => {
    // Fake timers: the 10-minute cycle wait can never elapse, so only SIGTERM can end it.
    jest.useFakeTimers();
    try {
      process.env.VEAOUTBOX_CHAINS = `${GNOSIS}`;
      process.env.NETWORKS = "devnet";
      process.argv = ["node", "watcher.ts", "--path=claimer"];
      const chains = createTwoChainRoute();
      mocks.FallbackProviderV5.mockImplementation(() => chains.outbox.provider);
      const before = { term: process.listeners("SIGTERM"), int: process.listeners("SIGINT") };
      const signal = new ShutdownSignal();
      const emitter = new EventEmitter();
      const requested: any[] = [];
      emitter.on(BotEvents.SHUTDOWN_REQUESTED, (p) => requested.push(p));
      const statuses: string[] = [];
      mocks.sendHeartbeat.mockImplementation(async (status: string) => {
        statuses.push(status);
      });
      // Deliver SIGTERM right after the watcher enters the cycle wait, through its installed handler.
      const realWait = signal.wait.bind(signal);
      let waits = 0;
      signal.wait = (ms: number) => {
        waits++;
        const waiting = realWait(ms);
        newListener("SIGTERM", before.term)("SIGTERM");
        return waiting;
      };
      await watch(signal, emitter as any, { cycleDelayMs: 10 * 60 * 1000 });
      expect(waits).toBe(1);
      expect(jest.getTimerCount()).toBe(0); // the wait's timer was cleared, not left to fire
      expect(signal.getIsShutdownSignal()).toBe(true);
      expect(requested).toEqual([{ signal: "SIGTERM" }]);
      // The sequence: started, then one or more running beats, then exactly one stopped, last.
      expect(statuses[0]).toBe("started");
      expect(statuses[statuses.length - 1]).toBe("stopped");
      const middle = statuses.slice(1, -1);
      expect(middle.length).toBeGreaterThanOrEqual(1);
      expect(middle.every((s) => s === "running")).toBe(true);
      expect(process.listeners("SIGTERM")).toEqual(before.term);
      expect(process.listeners("SIGINT")).toEqual(before.int);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a shutdown during epoch k's getClaim stops further getClaim calls and still sends stopped", async () => {
    let calls = 0;
    const statuses: string[] = [];
    let h0: any;
    mocks.getClaim.mockImplementation(async () => {
      calls++;
      if (calls === 3) harness().signal.setShutdownSignal();
      return null;
    });
    const h = await runWatcher({
      chains: `${GNOSIS},${SEPOLIA}`,
      networks: "testnet",
      cycles: 5,
      setup: (h) => {
        h0 = h;
        const impl = mocks.sendHeartbeat.getMockImplementation();
        mocks.sendHeartbeat.mockImplementation(async (status: string, ...rest: any[]) => {
          statuses.push(status);
          return impl?.(status, ...rest);
        });
      },
    });
    expect(h0).toBe(h);
    expect(h.calls.filter((c) => c.fn === "getClaim")).toHaveLength(3);
    expect(h.epochsOf("getClaim", 1, SEPOLIA)).toEqual([]);
    expect(statuses).toEqual(["started", "running", "stopped"]);
  });
});
