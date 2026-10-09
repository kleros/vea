jest.mock("./utils/envValidation", () => ({ validateEnvironment: jest.fn() }));
jest.mock("./utils/logger", () => ({ initialize: jest.fn() }));
jest.mock("./utils/heartbeat", () => ({ sendHeartbeat: jest.fn() }));
jest.mock("./utils/claim", () => ({ getClaim: jest.fn() }));
jest.mock("./helpers/claimer", () => ({ checkAndClaim: jest.fn() }));
jest.mock("./helpers/validator", () => ({ challengeAndResolveClaim: jest.fn() }));
jest.mock("./helpers/snapshot", () => ({ saveSnapshot: jest.fn() }));
jest.mock("./utils/ethers", () => ({
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
jest.mock("./utils/fallbackProvider", () => ({ FallbackRpcProvider: jest.fn() }));
jest.mock("./utils/fallbackProviderV5", () => ({ FallbackProviderV5: jest.fn() }));
jest.mock("./utils/transactionHandlers", () => ({ getTransactionHandler: jest.fn() }));
jest.mock("./consts/bridgeRoutes", () => {
  process.env.RPC_ARB = "https://arb.rpc.test";
  process.env.RPC_ETH = "https://eth.rpc.test";
  process.env.RPC_GNOSIS = "https://gnosis.rpc.test";
  return jest.requireActual("./consts/bridgeRoutes");
});

import { EventEmitter } from "events";
import { BotEvents } from "./utils/botEvents";
import { EpochOutcome } from "./utils/epochOutcome";
import { getBridgeConfig, Network } from "./consts/bridgeRoutes";
import { watch } from "./watcher";
import { ShutdownSignal } from "./utils/shutdown";
import { createTwoChainRoute } from "./testUtils/twoChainFixture";
import { mocks, resetMocks, runWatcher, harness, FakeHandler, fakeClaim, reporting } from "./watcher.harness";

const GNOSIS = 10200;
const SEPOLIA = 11155111;
const P_GNOSIS = getBridgeConfig(GNOSIS).routeConfig[Network.TESTNET].epochPeriod; // 3600
const HOUR = 3600;

/** The epochs a testnet route watches at chain time `now`: one challenge budget back. */
const windowOf = (chainId: number, now: number) => {
  const { routeConfig, sequencerDelayLimit, minChallengePeriod } = getBridgeConfig(chainId);
  const P = routeConfig[Network.TESTNET].epochPeriod;
  const B = P + sequencerDelayLimit + minChallengePeriod;
  return { low: Math.floor((now - B) / P) - 2, high: Math.floor(now / P) - 1 };
};

// The harness uses no host timers (chain time is the fixture's, the cycle wait is stubbed), so no
// assertion depends on machine speed; this bound only keeps a long multi-cycle run from failing
// on a loaded machine.
jest.setTimeout(120_000);

const savedArgv = process.argv;
const savedEnv = { ...process.env };
beforeEach(() => resetMocks());
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  process.argv = savedArgv;
  process.env = savedEnv;
});

describe("watcher: which epochs are watched", () => {
  it("watches the whole challenge-budget window every cycle, from chain time and not the host clock", async () => {
    let chainNow = 0;
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 1,
      setup: (h) => {
        chainNow = h.now(GNOSIS);
        jest.spyOn(Date, "now").mockReturnValue((chainNow + 2 * HOUR) * 1000);
      },
    });
    const epochs = h.epochsOf("checkAndClaim", 1);
    expect(Math.max(...epochs)).toBe(Math.floor(chainNow / P_GNOSIS) - 1);
    const w = windowOf(GNOSIS, chainNow);
    for (let e = w.low; e <= w.high; e++) expect(epochs).toContain(e);
  });

  it("examines the whole window every cycle and at most the cap of older epochs, resuming below the last one", async () => {
    const CAP = 5;
    let low = 0;
    let high = 0;
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 3,
      backlogEpochsPerCycle: CAP,
      setup: (h) => ({ low, high } = windowOf(GNOSIS, h.now(GNOSIS))),
    });
    const backlogOf = (cycle: number) => h.epochsOf("checkAndClaim", cycle).filter((e) => e < low);
    for (const cycle of [1, 2, 3]) {
      const epochs = h.epochsOf("checkAndClaim", cycle);
      // The claimable epoch comes first, then the rest of the window, then the capped backlog.
      expect(epochs[0]).toBe(high);
      for (let e = low; e <= high; e++) expect(epochs).toContain(e);
      expect(backlogOf(cycle)).toHaveLength(CAP);
    }
    // Each cycle continues below the oldest epoch the previous one reached, newest first.
    expect(backlogOf(1)[0]).toBe(low - 1);
    expect(Math.max(...backlogOf(2))).toBeLessThan(Math.min(...backlogOf(1)));
    expect(Math.max(...backlogOf(3))).toBeLessThan(Math.min(...backlogOf(2)));
  });

  it("examines every epoch a failed route skipped once it recovers", async () => {
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
    for (const epoch of missed) expect(h.epochsOf("getClaim", 5, GNOSIS)).toContain(epoch);
    // The other route ran in every cycle.
    for (const cycle of [1, 2, 3, 4, 5]) expect(h.epochsOf("getClaim", cycle, SEPOLIA).length).toBeGreaterThan(0);
  });

  it("still examines a claim that reaches the outbox read block only after its window closed", async () => {
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

  it("an older epoch is kept on a claim, a throw, PENDING, UNDECIDABLE or a returned handler; it leaves after two null cycles, or at once on DONE", async () => {
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
    for (const name of ["claim", "throw", "pending", "undecidable", "handler"]) {
      // Held on cycles 1-3, then two null cycles (4, 5): examined through cycle 5, gone on 6.
      const watched = [1, 2, 3, 4, 5, 6].map((cycle) => h.epochsOf("getClaim", cycle).includes(E[name]));
      expect({ name, watched }).toEqual({ name, watched: [true, true, true, true, true, false] });
    }
    expect(h.epochsOf("getClaim", 1)).toContain(E.handlerDone);
    expect(h.epochsOf("getClaim", 2)).not.toContain(E.handlerDone);
    expect(h.epochsOf("getClaim", 2)).toContain(E.plain);
    expect(h.epochsOf("getClaim", 3)).not.toContain(E.plain);
    const dropped = h.eventsNamed(BotEvents.EPOCH_DROPPED);
    expect(dropped).toContainEqual({ chainId: GNOSIS, network: "testnet", epoch: E.handlerDone, reason: "done" });
    expect(dropped).toContainEqual({ chainId: GNOSIS, network: "testnet", epoch: E.plain, reason: "no_claim" });
  });

  it("one helper's DONE does not drop an epoch the other reports PENDING", async () => {
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
  });

  it("a devnet route watches only the current epoch, dropping the previous one at rollover", async () => {
    const P = getBridgeConfig(GNOSIS).routeConfig[Network.DEVNET].epochPeriod;
    const expected: number[] = [];
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "devnet",
      path: "both",
      cycles: 3,
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(P);
        expected.push(Math.floor(h.now(GNOSIS) / P));
      },
    });
    for (const cycle of [1, 2, 3]) expect(h.epochsOf("checkAndClaim", cycle)).toEqual([expected[cycle - 1]]);
    expect(h.eventsNamed(BotEvents.EPOCH_DROPPED)).toContainEqual({
      chainId: GNOSIS,
      network: "devnet",
      epoch: expected[0],
      reason: "devnet_rollover",
    });
  });
});

describe("watcher: failures are contained", () => {
  it("a throw on one epoch neither stops the route's other epochs nor drops the epoch", async () => {
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
    expect(h.epochsOf("checkAndClaim", 1).length).toBeGreaterThan(1);
    expect(h.epochsOf("checkAndClaim", 2)).toContain(bad);
    const failed = h.eventsNamed(BotEvents.EPOCH_FAILED);
    expect(failed[0]).toEqual({ chainId: GNOSIS, network: "testnet", epoch: bad, message: expect.any(String) });
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

  it("a failing route does not stop the other route in the same cycle", async () => {
    const h = await runWatcher({
      chains: `${GNOSIS},${SEPOLIA}`,
      networks: "testnet",
      path: "both",
      cycles: 2,
      setup: (h) => h.failOutbox(GNOSIS, () => true),
    });
    expect(h.eventsNamed(BotEvents.ROUTE_FAILED)).toHaveLength(2);
    expect(JSON.stringify(h.eventsNamed(BotEvents.ROUTE_FAILED))).not.toMatch(/rpc\.test|secret-key/);
    const sepoliaEpoch = Math.floor(h.now(SEPOLIA) / 7200) - 1;
    expect(h.epochsOf("checkAndClaim", 2, SEPOLIA)).toContain(sepoliaEpoch);
  });
});

describe("watcher: transaction handlers", () => {
  it("builds one handler per epoch with every provider, and passes it to both helpers", async () => {
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
    const handler = challenged.params.transactionHandler;
    expect(handler).toBeInstanceOf(FakeHandler);
    expect(handler).toBe(claimed.params.transactionHandler);
    expect(handler.veaRouterProvider.name).toBe("sepolia");
    expect(handler.veaOutboxProvider.name).toBe("chiado");
    expect(handler.veaInboxProvider.name).toBe("arbitrum-sepolia");
    expect(FakeHandler.built.filter((b) => b.opts.epoch === E)).toHaveLength(1);
    expect(handler.opts.veaInbox).toEqual(expect.objectContaining({ kind: "inbox" }));
    expect(handler.opts.veaOutbox).toEqual(expect.objectContaining({ kind: "outbox" }));
    expect("now" in claimed.params).toBe(false);
  });

  it("keeps the snapshot handler under its own key, apart from the epoch's claim handler", async () => {
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
    expect(saves[1].params.transactionHandler).toBe(saves[0].params.transactionHandler);
    expect(saves[0].params.now).toBe(h.now(GNOSIS));
    expect(claims[0].params.transactionHandler).not.toBe(saves[0].params.transactionHandler);
    expect(h.state.transactionHandlers[`snapshot_${GNOSIS}_devnet_${E}`]).toBe(saves[0].params.transactionHandler);
    expect(h.state.transactionHandlers[`${GNOSIS}_devnet_${E}`]).toBe(claims[0].params.transactionHandler);
  });

  it("two routes with the same epoch number never share a handler", async () => {
    const h = await runWatcher({ chains: `${GNOSIS},${SEPOLIA}`, networks: "devnet", path: "claimer", cycles: 1 });
    const [a, b] = h.calls.filter((c) => c.fn === "checkAndClaim");
    expect(a.epoch).toBe(b.epoch);
    expect(a.params.transactionHandler).not.toBe(b.params.transactionHandler);
  });
});

describe("watcher: alerts", () => {
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
    return { E, alerts: h.eventsNamed(BotEvents.ALERT).filter((a) => a.code === "epoch_undecidable") };
  };

  it("raises epoch_undecidable after 15 undecidable cycles (throws count), only past the first hour, and resets on a decided cycle", async () => {
    expect((await undecidableRun(60, 15)).alerts).toHaveLength(0);
    const { alerts, E } = await undecidableRun(HOUR, 30, [3, 15, 22]);
    expect(alerts.map((a) => a.details.consecutiveCycles)).toEqual([15, 30]);
    expect(alerts[0]).toEqual(expect.objectContaining({ chainId: GNOSIS, network: "testnet", epoch: E }));
    expect((await undecidableRun(HOUR, 20, [], [10])).alerts).toHaveLength(0);
  });

  it("raises the liveness alarm once per 24 h of chain time without a claim, from the newest claim seen", async () => {
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
    expect(h.eventsNamed(BotEvents.LIVENESS_ALARM)).toEqual([
      { chainId: GNOSIS, network: "testnet", secondsSinceLastClaim: 24 * HOUR },
    ]);
  });

  it("never raises the liveness alarm on devnet", async () => {
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "devnet",
      path: "challenger",
      cycles: 9,
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(6 * HOUR);
      },
    });
    expect(h.eventsNamed(BotEvents.LIVENESS_ALARM)).toEqual([]);
  });
});

describe("watcher: heartbeat and shutdown", () => {
  it("sends started after validateEnvironment, running each cycle and stopped on exit", async () => {
    const order: string[] = [];
    mocks.validateEnvironment.mockImplementation(async () => {
      order.push("validateEnvironment");
      return { signerAddress: "0x", chainIds: [], networks: [], warnings: [] };
    });
    await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      cycles: 2,
      setup: () => {
        const impl = mocks.sendHeartbeat.getMockImplementation();
        mocks.sendHeartbeat.mockImplementation(async (status: string, ...rest: any[]) => {
          order.push(status);
          return impl?.(status, ...rest);
        });
      },
    });
    expect(order).toEqual(["validateEnvironment", "started", "running", "running", "running", "stopped"]);
  });

  it("sends no heartbeat when validateEnvironment throws", async () => {
    mocks.validateEnvironment.mockRejectedValue(new Error("bad env"));
    await expect(watch(new ShutdownSignal(), undefined, { cycleDelayMs: 0 })).rejects.toThrow("bad env");
    expect(mocks.sendHeartbeat).not.toHaveBeenCalled();
  });

  it("SIGTERM during the cycle wait ends the watcher cleanly: stopped is sent and the handlers are removed", async () => {
    // Fake timers: the 10-minute cycle wait can never elapse, so only SIGTERM can end it.
    jest.useFakeTimers();
    try {
      process.env.VEAOUTBOX_CHAINS = `${GNOSIS}`;
      process.env.NETWORKS = "devnet";
      process.argv = ["node", "watcher.ts", "--path=claimer"];
      mocks.FallbackProviderV5.mockImplementation(() => createTwoChainRoute().outbox.provider);
      const before = { term: process.listeners("SIGTERM"), int: process.listeners("SIGINT") };
      const signal = new ShutdownSignal();
      const emitter = new EventEmitter();
      const requested: any[] = [];
      emitter.on(BotEvents.SHUTDOWN_REQUESTED, (p) => requested.push(p));
      const statuses: string[] = [];
      mocks.sendHeartbeat.mockImplementation(async (status: string) => {
        statuses.push(status);
      });
      const realWait = signal.wait.bind(signal);
      signal.wait = (ms: number) => {
        const waiting = realWait(ms);
        const handler = process.listeners("SIGTERM").find((l) => !before.term.includes(l)) as (s: string) => void;
        handler("SIGTERM");
        return waiting;
      };
      await watch(signal, emitter as any, { cycleDelayMs: 10 * 60 * 1000 });
      expect(jest.getTimerCount()).toBe(0);
      expect(requested).toEqual([{ signal: "SIGTERM" }]);
      expect(statuses[0]).toBe("started");
      expect(statuses[statuses.length - 1]).toBe("stopped");
      expect(process.listeners("SIGTERM")).toEqual(before.term);
      expect(process.listeners("SIGINT")).toEqual(before.int);
    } finally {
      jest.useRealTimers();
    }
  });
});
