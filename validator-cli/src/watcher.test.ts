jest.mock("./utils/envValidation", () => ({ validateEnvironment: jest.fn() }));
jest.mock("./utils/logger", () => ({ initialize: jest.fn() }));
jest.mock("./utils/heartbeat", () => ({ sendHeartbeat: jest.fn() }));
jest.mock("./utils/claim", () => ({ getClaim: jest.fn() }));
jest.mock("./helpers/claimer", () => ({ checkAndClaim: jest.fn() }));
jest.mock("./helpers/validator", () => ({ challengeAndResolveClaim: jest.fn() }));
jest.mock("./helpers/snapshot", () => ({ saveSnapshot: jest.fn() }));
jest.mock("./utils/graphQueries", () => ({ getClaimedEpochsBelow: jest.fn(), getIndexedBlock: jest.fn() }));
// `claimHashes(epoch, overrides)` of every route's outbox contract.
const mockClaimHashes = jest.fn();
// The sends a real handler makes: the inbox's `saveSnapshot` and the devnet outbox's `devnetAdvanceState`.
const mockSaveSnapshotSend = jest.fn();
const mockDevnetAdvanceStateSend = jest.fn();
jest.mock("./utils/ethers", () => ({
  getVeaInbox: jest.fn((address: string, _key: any, _p: any, chainId: number, network: string) => ({
    kind: "inbox",
    address,
    chainId,
    network,
    runner: { address: "0x00000000000000000000000000000000000000aa" },
    saveSnapshot: (...args: any[]) => mockSaveSnapshotSend(...args),
  })),
  getVeaOutbox: jest.fn((address: string, _key: any, _p: any, chainId: number, network: string) => ({
    kind: "outbox",
    address,
    target: address,
    chainId,
    network,
    runner: { address: "0x00000000000000000000000000000000000000aa" },
    claimHashes: (...args: any[]) => mockClaimHashes(...args),
    devnetAdvanceState: (...args: any[]) => mockDevnetAdvanceStateSend(...args),
  })),
}));
// The handlers share its broadcast-answer classifier (ALREADY_KNOWN, NONCE_USED); only the provider is faked.
jest.mock("./utils/fallbackProvider", () => ({
  ...jest.requireActual("./utils/fallbackProvider"),
  FallbackRpcProvider: jest.fn(),
}));
jest.mock("./utils/fallbackProviderV5", () => ({ FallbackProviderV5: jest.fn() }));
jest.mock("./utils/transactionHandlers", () => ({ getTransactionHandler: jest.fn() }));
jest.mock("./consts/bridgeRoutes", () => {
  process.env.RPC_ARB = "https://arb.rpc.test";
  process.env.RPC_ETH = "https://eth.rpc.test";
  process.env.RPC_GNOSIS = "https://gnosis.rpc.test";
  return jest.requireActual("./consts/bridgeRoutes");
});

import { EventEmitter } from "events";
import { ZeroHash } from "ethers";
import { BotEvents } from "./utils/botEvents";
import { EpochOutcome } from "./utils/epochOutcome";
import { getBridgeConfig, Network } from "./consts/bridgeRoutes";
import { watch, snapshotHandlerKey } from "./watcher";
import { ShutdownSignal } from "./utils/shutdown";
import { setEpochRange } from "./utils/epochHandler";
import { createTwoChainRoute } from "./testUtils/twoChainFixture";
import { mocks, resetMocks, runWatcher, harness, FakeHandler, fakeClaim, reporting, RPC } from "./watcher.harness";
import { resetUnminedSends } from "./utils/transactionHandlers/baseTransactionHandler";
import { signedSend } from "./testUtils/signedSends";

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
beforeEach(() => {
  resetMocks();
  mockClaimHashes.mockReset().mockResolvedValue(ZeroHash);
  mockSaveSnapshotSend.mockReset();
  mockDevnetAdvanceStateSend.mockReset();
  resetUnminedSends();
});
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

  it("skips a window epoch once it reported DONE, but examines the claimable epoch every cycle", async () => {
    let low = 0;
    let high = 0;
    mocks.checkAndClaim.mockImplementation(
      reporting(({ epoch }) => (epoch === low + 3 || epoch === high ? EpochOutcome.DONE : undefined))
    );
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 3,
      setup: (h) => ({ low, high } = windowOf(GNOSIS, h.now(GNOSIS))),
    });
    expect(h.epochsOf("checkAndClaim", 1)).toContain(low + 3);
    for (const cycle of [2, 3]) {
      expect(h.epochsOf("checkAndClaim", cycle)).not.toContain(low + 3);
      expect(h.epochsOf("checkAndClaim", cycle)).toContain(low + 4);
      expect(h.epochsOf("checkAndClaim", cycle)[0]).toBe(high);
    }
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

describe("watcher: claims older than the cold-start range", () => {
  const CLAIMED = "0x" + "77".repeat(32);
  const OUTBOX = getBridgeConfig(GNOSIS).routeConfig[Network.TESTNET].veaOutbox.address;
  /** The oldest epoch a testnet route seeds on its first cycle at chain time `now`. */
  const coldStartLow = (now: number) =>
    Math.min(...setEpochRange({ chainId: GNOSIS, currentTimestamp: now, epochPeriod: P_GNOSIS }));

  it("after a restart, watches the older claimed epochs the indexer lists whose claim hash is non-zero, and only those", async () => {
    let below = 0;
    let high = 0;
    let older: number[] = [];
    let examinedBefore: number[] = [];
    mocks.getClaimedEpochsBelow.mockImplementation(async () => {
      examinedBefore = harness().epochsOf("checkAndClaim", harness().cycle());
      return older;
    });
    // Alternate: the first and third were never withdrawn, the second and fourth were (zero hash).
    mockClaimHashes.mockImplementation(async (epoch: number) => (older.indexOf(epoch) % 2 === 0 ? CLAIMED : ZeroHash));
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 4,
      setup: (h) => {
        below = coldStartLow(h.now(GNOSIS));
        high = windowOf(GNOSIS, h.now(GNOSIS)).high;
        older = [below - 900, below - 300, below - 200, below - 1];
      },
    });
    expect(mocks.getClaimedEpochsBelow.mock.calls).toEqual([[OUTBOX, below, GNOSIS]]);
    // Only after the cycle's own epochs: the claimable one first, the seeded range all done.
    expect(examinedBefore[0]).toBe(high);
    expect(examinedBefore).toContain(below);
    // Every hash is read at the outbox read block (Chiado's finalized block), never at the head.
    const readBlock = h.chains.outbox.block("finalized").number;
    expect(mockClaimHashes.mock.calls.map(([epoch, overrides]) => [epoch, overrides])).toEqual(
      older.map((epoch) => [epoch, { blockTag: readBlock }])
    );
    expect(h.epochsOf("checkAndClaim", 1)).not.toContain(older[0]);
    const watched = h.epochsOf("checkAndClaim", 2);
    expect(watched).toEqual(expect.arrayContaining([older[0], older[2]]));
    expect(watched).not.toContain(older[1]);
    expect(watched).not.toContain(older[3]);
    // They leave like any older epoch: after two cycles without a claim.
    expect(h.epochsOf("checkAndClaim", 3)).toContain(older[0]);
    expect(h.epochsOf("checkAndClaim", 4)).not.toContain(older[0]);
    expect(h.eventsNamed(BotEvents.EPOCH_DROPPED)).toContainEqual({
      chainId: GNOSIS,
      network: "testnet",
      epoch: older[0],
      reason: "no_claim",
    });
  });

  it("reads the claim hashes at most 3 at once: reads made together go out as one JSON-RPC batch", async () => {
    let older: number[] = [];
    let inFlight = 0;
    let mostInFlight = 0;
    mocks.getClaimedEpochsBelow.mockImplementation(async () => older);
    mockClaimHashes.mockImplementation(async () => {
      mostInFlight = Math.max(mostInFlight, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return CLAIMED;
    });
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 2,
      setup: (h) => {
        const below = coldStartLow(h.now(GNOSIS));
        older = Array.from({ length: 120 }, (_, i) => below - 1 - i);
      },
    });
    expect(mockClaimHashes).toHaveBeenCalledTimes(120);
    expect(mostInFlight).toBe(3);
    expect(h.epochsOf("checkAndClaim", 2)).toEqual(expect.arrayContaining(older));
  });

  it("a read refused inside a batch (an endpoint capping batches) is retried alone and the discovery completes", async () => {
    let older: number[] = [];
    let inFlight = 0;
    mocks.getClaimedEpochsBelow.mockImplementation(async () => older);
    mockClaimHashes.mockImplementation(async () => {
      inFlight++;
      await Promise.resolve();
      const batched = inFlight > 1;
      inFlight--;
      if (batched) throw new Error("Batch of more than 1 requests are not allowed on free plan");
      return CLAIMED;
    });
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 2,
      setup: (h) => {
        const below = coldStartLow(h.now(GNOSIS));
        older = Array.from({ length: 7 }, (_, i) => below - 1 - i);
      },
    });
    expect(h.epochsOf("checkAndClaim", 2)).toEqual(expect.arrayContaining(older));
    expect(h.eventsNamed(BotEvents.ALERT).filter((a) => a.code === "COLD_START_DISCOVERY_FAILED")).toEqual([]);
  });

  it("keeps the epochs read before a failed read, resumes at the first one left next cycle, and asks the indexer once", async () => {
    let older: number[] = [];
    mocks.getClaimedEpochsBelow.mockImplementation(async () => older);
    mockClaimHashes.mockImplementation(async (epoch: number) => {
      if (harness().cycle() === 1 && epoch === older[4]) throw new Error("rpc down");
      return CLAIMED;
    });
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 3,
      setup: (h) => {
        const below = coldStartLow(h.now(GNOSIS));
        older = Array.from({ length: 9 }, (_, i) => below - 1 - i);
      },
    });
    // The first group of 3 was read before the failing one: watched from the next cycle on.
    const second = h.epochsOf("checkAndClaim", 2);
    expect(second).toEqual(expect.arrayContaining(older.slice(0, 3)));
    for (const epoch of older.slice(3)) expect(second).not.toContain(epoch);
    // Cycle 2 resumes at the failed group's first epoch, never re-reading the first group.
    expect(h.epochsOf("checkAndClaim", 3)).toEqual(expect.arrayContaining(older.slice(3)));
    expect(mockClaimHashes.mock.calls.filter(([epoch]) => epoch === older[0])).toHaveLength(1);
    expect(mocks.getClaimedEpochsBelow).toHaveBeenCalledTimes(1);
    expect(h.eventsNamed(BotEvents.ALERT).filter((a) => a.code === "COLD_START_DISCOVERY_FAILED")).toEqual([
      expect.objectContaining({ details: expect.objectContaining({ failedCycles: 1, epochsLeft: 6 }) }),
    ]);
  });

  it.each([
    ["the indexer", () => mocks.getClaimedEpochsBelow, 4],
    // The indexer listed them on the first cycle: only the reads are retried.
    ["a claim hash read", () => mockClaimHashes, 1],
  ])(
    "when %s fails, alerts once, retries every cycle until it succeeds and never fails the route",
    async (_name, failing, indexerCalls) => {
      let below = 0;
      let older: number[] = [];
      mocks.getClaimedEpochsBelow.mockImplementation(async () => older);
      mockClaimHashes.mockResolvedValue(CLAIMED);
      const succeed = failing().getMockImplementation()!;
      failing().mockImplementation(async (...args: any[]) => {
        if (harness().cycle() <= 3) throw new Error("down at https://indexer.example/v1/graphql?key=secret");
        return succeed(...args);
      });
      const h = await runWatcher({
        chains: `${GNOSIS}`,
        networks: "testnet",
        path: "claimer",
        cycles: 5,
        setup: (h) => {
          below = coldStartLow(h.now(GNOSIS));
          older = [below - 10];
        },
      });
      const alerts = h.eventsNamed(BotEvents.ALERT).filter((a) => a.code === "COLD_START_DISCOVERY_FAILED");
      expect(alerts).toEqual([
        {
          level: "warn",
          code: "COLD_START_DISCOVERY_FAILED",
          chainId: GNOSIS,
          network: "testnet",
          details: {
            belowEpoch: below,
            failedCycles: 1,
            epochsLeft: indexerCalls === 1 ? 1 : undefined,
            message: expect.any(String),
          },
        },
      ]);
      expect(JSON.stringify(alerts)).not.toMatch(/indexer\.example|secret/);
      expect(h.eventsNamed(BotEvents.ROUTE_FAILED)).toEqual([]);
      // Tried on cycles 1-4 (the fourth succeeds), not again after.
      expect(mocks.getClaimedEpochsBelow).toHaveBeenCalledTimes(indexerCalls);
      for (const cycle of [1, 2, 3, 4, 5]) {
        expect(h.epochsOf("checkAndClaim", cycle)[0]).toBe(windowOf(GNOSIS, h.now(GNOSIS)).high);
      }
      expect(h.epochsOf("checkAndClaim", 4)).not.toContain(older[0]);
      expect(h.epochsOf("checkAndClaim", 5)).toContain(older[0]);
    }
  );

  it("lists the older claims only from an indexer that has processed the outbox chain past them: a re-indexing one leaves discovery pending", async () => {
    let below = 0;
    let older: number[] = [];
    let caughtUp = false;
    // Re-indexing from scratch on the same URL: it lists nothing yet, and is at a block a month back.
    mocks.getClaimedEpochsBelow.mockImplementation(async () => (caughtUp ? older : []));
    mocks.getIndexedBlock.mockImplementation(async (chainId: number) => {
      expect(chainId).toBe(GNOSIS);
      const chiado = harness().chains.outbox;
      const head = chiado.block("latest");
      // The last Chiado block before (below + 1)·P, where the last claim window below the range ends.
      const lastBefore = head.number - Math.ceil((head.timestamp - ((below + 1) * P_GNOSIS - 1)) / 5);
      return caughtUp ? lastBefore + 1 : lastBefore;
    });
    mockClaimHashes.mockResolvedValue(CLAIMED);
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 4,
      setup: (h) => {
        below = coldStartLow(h.now(GNOSIS));
        older = [below - 10];
      },
      beforeCycle: (cycle) => {
        if (cycle === 3) caughtUp = true;
      },
    });
    const alerts = h.eventsNamed(BotEvents.ALERT).filter((a) => a.code === "COLD_START_DISCOVERY_FAILED");
    expect(alerts).toEqual([expect.objectContaining({ details: expect.objectContaining({ failedCycles: 1 }) })]);
    // Listed only once the check passes, on the third cycle.
    expect(mocks.getClaimedEpochsBelow).toHaveBeenCalledTimes(1);
    expect(h.epochsOf("checkAndClaim", 3)).not.toContain(older[0]);
    expect(h.epochsOf("checkAndClaim", 4)).toContain(older[0]);
  });

  it("reads the indexer's progress before the list: a claim it indexes between the two reads is not lost", async () => {
    let below = 0;
    let older: number[] = [];
    let crossed = false;
    // Syncing just short of (below + 1)·P, the indexer lists only the oldest claim. The commit that
    // crosses the threshold, with the newest claim in it, lands as its progress is read.
    mocks.getClaimedEpochsBelow.mockImplementation(async () => (crossed ? older : older.slice(0, 1)));
    const atHead = mocks.getIndexedBlock.getMockImplementation()!;
    mocks.getIndexedBlock.mockImplementation(async (chainId: number) => {
      crossed = true;
      return atHead(chainId);
    });
    mockClaimHashes.mockResolvedValue(CLAIMED);
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 2,
      setup: (h) => {
        below = coldStartLow(h.now(GNOSIS));
        older = [below - 300, below - 1];
      },
    });
    expect(mocks.getIndexedBlock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getClaimedEpochsBelow.mock.invocationCallOrder[0]
    );
    expect(mocks.getClaimedEpochsBelow).toHaveBeenCalledTimes(1);
    expect(h.epochsOf("checkAndClaim", 2)).toEqual(expect.arrayContaining(older));
  });

  it("reads at most the cap of claim-hash batches a cycle, and the next cycle resumes the queue", async () => {
    let older: number[] = [];
    const reads: Array<[number, number]> = [];
    mocks.getClaimedEpochsBelow.mockImplementation(async () => older);
    mockClaimHashes.mockImplementation(async (epoch: number) => {
      reads.push([harness().cycle(), epoch]);
      return CLAIMED;
    });
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 3,
      discoveryBatchesPerCycle: 2,
      setup: (h) => {
        const below = coldStartLow(h.now(GNOSIS));
        older = Array.from({ length: 10 }, (_, i) => below - 1 - i);
      },
    });
    const readIn = (cycle: number) => reads.filter(([c]) => c === cycle).map(([, epoch]) => epoch);
    expect(readIn(1)).toEqual(older.slice(0, 6));
    expect(readIn(2)).toEqual(older.slice(6));
    expect(readIn(3)).toEqual([]);
    expect(h.epochsOf("checkAndClaim", 2)).toEqual(expect.arrayContaining(older.slice(0, 6)));
    expect(h.epochsOf("checkAndClaim", 3)).toEqual(expect.arrayContaining(older.slice(6)));
    expect(mocks.getClaimedEpochsBelow).toHaveBeenCalledTimes(1);
    expect(h.eventsNamed(BotEvents.ALERT).filter((a) => a.code === "COLD_START_DISCOVERY_FAILED")).toEqual([]);
  });

  it("stops reading claim hashes between batches once shutdown is asked", async () => {
    let older: number[] = [];
    mocks.getClaimedEpochsBelow.mockImplementation(async () => older);
    mockClaimHashes.mockImplementation(async () => {
      harness().signal.setShutdownSignal();
      return CLAIMED;
    });
    await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      cycles: 2,
      setup: (h) => {
        const below = coldStartLow(h.now(GNOSIS));
        older = Array.from({ length: 10 }, (_, i) => below - 1 - i);
      },
    });
    expect(mockClaimHashes).toHaveBeenCalledTimes(3);
  });

  it("raises COLD_START_DISCOVERY_FAILED again after every 15 more failed cycles", async () => {
    mocks.getClaimedEpochsBelow.mockRejectedValue(new Error("indexer down"));
    const h = await runWatcher({ chains: `${GNOSIS}`, networks: "testnet", path: "claimer", cycles: 31 });
    const alerts = h.eventsNamed(BotEvents.ALERT).filter((a) => a.code === "COLD_START_DISCOVERY_FAILED");
    expect(alerts.map((a) => a.details.failedCycles)).toEqual([1, 16, 31]);
  });

  it("a devnet route never looks for older claims", async () => {
    await runWatcher({ chains: `${GNOSIS}`, networks: "devnet", path: "both", cycles: 2 });
    expect(mocks.getClaimedEpochsBelow).not.toHaveBeenCalled();
    expect(mockClaimHashes).not.toHaveBeenCalled();
  });
});

describe("watcher: snapshot saving", () => {
  const ROOT_CLAIMED = "0x" + "aa".repeat(32);
  const ROOT_SAVED = "0x" + "bb".repeat(32);
  // Chain time 5 minutes before epoch E ends: inside its 10-minute snapshot saving period.
  const E = Math.floor(1_760_000_000 / P_GNOSIS);
  const IN_SAVING_PERIOD = (E + 1) * P_GNOSIS - 300;

  interface SnapshotChain {
    count: number;
    savedCount: number;
    savedRoot: string;
    snapshots: Record<number, string>;
    claimedRoot: string;
    stateRoot: string;
  }

  /**
   * Run the real saveSnapshot and isSnapshotNeeded over an inbox and outbox whose reads return
   * `chain`. Returns the cycles in which the snapshot handler was asked to save.
   */
  const realSnapshot = (chain: SnapshotChain): number[] => {
    const actual = jest.requireActual("./helpers/snapshot");
    const veaInbox = {
      target: "0xinbox",
      count: async () => chain.count,
      filters: { SnapshotSaved: () => ({}) },
      queryFilter: async (_f: any, _from: number, to: number) => [
        { args: [chain.savedRoot, 0, chain.savedCount], blockNumber: to, index: 0 },
      ],
      snapshots: async (epoch: number) => chain.snapshots[epoch] ?? ZeroHash,
    };
    const veaOutbox = {
      target: "0xoutbox",
      filters: { Claimed: () => ({}) },
      queryFilter: async (_f: any, _from: number, to: number) => [
        { data: chain.claimedRoot, blockNumber: to, index: 0 },
      ],
      stateRoot: async () => chain.stateRoot,
    };
    mocks.saveSnapshot.mockImplementation((params: any) => actual.saveSnapshot({ ...params, veaInbox, veaOutbox }));
    const asked: number[] = [];
    mocks.getTransactionHandler.mockImplementation(
      () =>
        class extends FakeHandler {
          async saveSnapshot() {
            asked.push(harness().cycle());
          }
        }
    );
    return asked;
  };

  it("passes back the count saveSnapshot returned within an epoch, and -1 in a new epoch", async () => {
    mocks.saveSnapshot.mockImplementation(async ({ transactionHandler }: any) => ({
      updatedTransactionHandler: transactionHandler,
      latestCount: 5,
    }));
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      saveSnapshot: true,
      cycles: 4,
      beforeCycle: (cycle, h) => {
        if (cycle === 3) h.advance(P_GNOSIS);
      },
    });
    const counts = h.calls.filter((c) => c.fn === "saveSnapshot").map((c) => c.params.count);
    expect(counts).toEqual([-1, 5, -1, 5]);
    // One SnapshotSaved cache for the route, kept across the new epoch.
    const caches = h.calls.filter((c) => c.fn === "saveSnapshot").map((c) => c.params.savedCache);
    expect(caches[0]).toBeDefined();
    for (const cache of caches) expect(cache).toBe(caches[0]);
  });

  it("a save that was sent and never landed is retried next cycle", async () => {
    // Five messages, the last snapshot saved covers three: a save is needed, and it never lands.
    const asked = realSnapshot({
      count: 5,
      savedCount: 3,
      savedRoot: ROOT_SAVED,
      snapshots: {},
      claimedRoot: ROOT_CLAIMED,
      stateRoot: ROOT_CLAIMED,
    });
    await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      saveSnapshot: true,
      cycles: 3,
      now: IN_SAVING_PERIOD,
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(60);
      },
    });
    // Asked every cycle; the handler, not the watcher, keeps a save in flight from being re-sent.
    expect(asked).toEqual([1, 2, 3]);
  });

  it("a new epoch re-evaluates at an unchanged count: the snapshot of an epoch whose claim was missed is saved again", async () => {
    // Epoch E's snapshot covers all five messages, but no claim for it shows on the outbox.
    const asked = realSnapshot({
      count: 5,
      savedCount: 5,
      savedRoot: ROOT_SAVED,
      snapshots: { [E]: ROOT_SAVED },
      claimedRoot: ROOT_CLAIMED,
      stateRoot: ROOT_CLAIMED,
    });
    await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      saveSnapshot: true,
      cycles: 2,
      now: IN_SAVING_PERIOD,
      // Cycle 2 is in epoch E+1's saving period, with no new message.
      beforeCycle: (cycle, h) => {
        if (cycle === 2) h.advance(P_GNOSIS);
      },
    });
    expect(asked).toEqual([2]);
  });
});

describe("watcher: snapshot saving with the real helpers and handler", () => {
  const GWEI = BigInt(1_000_000_000);
  const ROOT_SAVED = "0x" + "bb".repeat(32);
  const E = Math.floor(1_760_000_000 / P_GNOSIS);
  // 590 s before epoch E ends: inside its 10-minute saving period, which four 60 s cycles stay in.
  const IN_SAVING_PERIOD = (E + 1) * P_GNOSIS - 590;

  interface InboxChain {
    count: number;
    /** SnapshotSaved logs on the inbox chain, by block. */
    saved: { blockNumber: number; count: number; root: string }[];
    claimedRoot?: string;
    stateRoot: string;
  }

  /**
   * The real saveSnapshot, isSnapshotNeeded and ArbToGnosisTransactionHandler over an inbox whose
   * saves are mined at once (the inbox finalized block trails latest by ~20 min, as on Arbitrum).
   * Returns the inbox count each save was sent at.
   */
  const realSave = (chain: InboxChain, indexer: { fetchLastSnapshotSaved: any; fetchLastClaimedEpoch: any }) => {
    const actual = jest.requireActual("./helpers/snapshot");
    const { ArbToGnosisTransactionHandler } = jest.requireActual("./utils/transactionHandlers/arbToGnosisHandler");
    mocks.getTransactionHandler.mockImplementation(() => ArbToGnosisTransactionHandler);
    const veaInbox = {
      target: "0xinbox",
      count: async () => chain.count,
      filters: { SnapshotSaved: () => ({}) },
      queryFilter: async (_f: any, from: number, to: number) =>
        chain.saved
          .filter((log) => log.blockNumber >= from && log.blockNumber <= to)
          .map((log) => ({ args: [log.root, E, log.count], blockNumber: log.blockNumber, index: 0 })),
      snapshots: async () => ZeroHash,
    };
    const veaOutbox = {
      target: "0xoutbox",
      filters: { Claimed: () => ({}) },
      queryFilter: async (_f: any, _from: number, to: number) =>
        chain.claimedRoot ? [{ data: chain.claimedRoot, blockNumber: to, index: 0 }] : [],
      stateRoot: async () => chain.stateRoot,
    };
    mocks.saveSnapshot.mockImplementation((params: any) =>
      actual.saveSnapshot({
        ...params,
        veaInbox,
        veaOutbox,
        toSaveSnapshot: (check: any) => actual.isSnapshotNeeded({ ...check, ...indexer }),
      })
    );
    const sentAt: number[] = [];
    const hashes: Record<string, number> = {};
    mockSaveSnapshotSend.mockImplementation(async () => {
      const blockNumber = harness().chains.inbox.block("latest").number;
      const hash = "0x" + String(sentAt.length + 1).padStart(64, "0");
      hashes[hash] = blockNumber;
      sentAt.push(chain.count);
      chain.saved.push({ blockNumber, count: chain.count, root: ROOT_SAVED });
      return { hash, nonce: 6 + sentAt.length, maxFeePerGas: GWEI, maxPriorityFeePerGas: GWEI };
    });
    const rpcMethods = (url: string) =>
      url === RPC.arb
        ? {
            getTransactionReceipt: async (hash: string) =>
              hashes[hash] === undefined ? null : { blockNumber: hashes[hash], status: 1, logs: [] },
            getTransactionCount: async () => 7 + sentAt.length,
            getFeeData: async () => ({ maxFeePerGas: GWEI, maxPriorityFeePerGas: GWEI }),
          }
        : {};
    return { sentAt, rpcMethods };
  };
  const run = (rpcMethods: (url: string) => Record<string, unknown>, opts: Partial<Parameters<typeof runWatcher>[0]>) =>
    runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      saveSnapshot: true,
      cycles: 4,
      now: IN_SAVING_PERIOD,
      rpcMethods,
      setup: (h) => jest.spyOn(Date, "now").mockImplementation(() => h.now(GNOSIS) * 1000),
      ...opts,
    });
  const snapshotFailures = (h: Awaited<ReturnType<typeof runWatcher>>) =>
    h.eventsNamed(BotEvents.EPOCH_FAILED).filter((e) => String(e.message).startsWith("saveSnapshot"));

  it("a message that arrives after our save, while the inbox finalized block is still below it, is saved in the same epoch", async () => {
    const chain: InboxChain = { count: 5, saved: [], claimedRoot: ROOT_SAVED, stateRoot: ROOT_SAVED };
    const { sentAt, rpcMethods } = realSave(chain, {
      fetchLastSnapshotSaved: jest.fn(),
      fetchLastClaimedEpoch: jest.fn(),
    });
    const h = await run(rpcMethods, {
      setup: (h) => {
        jest.spyOn(Date, "now").mockImplementation(() => h.now(GNOSIS) * 1000);
        // The last save before this epoch's window covered 3 messages, below the finalized block.
        chain.saved.push({ blockNumber: h.chains.inbox.block("finalized").number - 10, count: 3, root: ROOT_SAVED });
      },
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(60);
        // A sixth message, two cycles after our save of five.
        if (cycle === 3) chain.count = 6;
      },
    });
    // Held at the count it saved (the SnapshotSaved scan cannot see it yet), superseded at six.
    expect(sentAt).toEqual([5, 6]);
    expect(snapshotFailures(h)).toEqual([]);
  });

  it("with no SnapshotSaved log in the lookback, the indexer's count keeps an epoch that saved every message from saving again", async () => {
    // Five messages, all saved and that root claimed and verified; no Claimed log in the lookback.
    const chain: InboxChain = { count: 5, saved: [], stateRoot: ROOT_SAVED };
    const fetchLastSnapshotSaved = jest.fn().mockResolvedValue({ count: 5, stateRoot: ROOT_SAVED });
    const { sentAt, rpcMethods } = realSave(chain, { fetchLastSnapshotSaved, fetchLastClaimedEpoch: jest.fn() });
    const h = await run(rpcMethods, {
      cycles: 8,
      // Two cycles in each of four epochs' saving periods.
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(cycle % 2 === 0 ? 60 : P_GNOSIS - 60);
      },
    });
    expect(fetchLastSnapshotSaved).toHaveBeenCalled();
    expect(sentAt).toEqual([]);
    expect(snapshotFailures(h)).toEqual([]);
  });

  it("an indexer that is down does not stop a save the on-chain SnapshotSaved log shows is needed", async () => {
    // The last save covered 5 of 6 messages; no Claimed log on the quiet outbox.
    const chain: InboxChain = { count: 6, saved: [], stateRoot: ROOT_SAVED };
    const down = () => jest.fn().mockRejectedValue(new Error("indexer timed out"));
    const { sentAt, rpcMethods } = realSave(chain, { fetchLastSnapshotSaved: down(), fetchLastClaimedEpoch: down() });
    const h = await run(rpcMethods, {
      setup: (h) => {
        jest.spyOn(Date, "now").mockImplementation(() => h.now(GNOSIS) * 1000);
        chain.saved.push({ blockNumber: h.chains.inbox.block("finalized").number - 10, count: 5, root: ROOT_SAVED });
      },
      beforeCycle: (cycle, h) => {
        if (cycle > 1) h.advance(60);
      },
    });
    expect(sentAt).toEqual([6]);
    expect(snapshotFailures(h)).toEqual([]);
  });
});

describe("watcher: the claim-log scans of epochs older than the window share a budget per cycle", () => {
  it("passes a budget only for epochs below the window, the same one to each of them in a cycle", async () => {
    const h = await runWatcher({ chains: `${GNOSIS}`, networks: "testnet", path: "claimer", cycles: 2 });
    const { low } = windowOf(GNOSIS, h.now(GNOSIS));
    const calls = h.calls.filter((c) => c.fn === "getClaim" && c.cycle === 1);
    const inWindow = calls.filter((c) => c.epoch >= low);
    const backlog = calls.filter((c) => c.epoch < low);
    expect(inWindow.length).toBeGreaterThan(0);
    expect(backlog.length).toBeGreaterThan(1);
    for (const c of inWindow) expect(c.params.scanBudget).toBeUndefined();
    for (const c of backlog) expect(c.params.scanBudget).toBe(backlog[0].params.scanBudget);
    expect(backlog[0].params.scanBudget).toEqual({ blocksLeft: expect.any(Number) });
    const second = h.calls.find((c) => c.fn === "getClaim" && c.cycle === 2 && c.epoch < low);
    expect(second?.params.scanBudget).not.toBe(backlog[0].params.scanBudget);
  });

  it("the same budget bounds the scan for our sendSnapshot of a disputed claim below the window", async () => {
    mocks.getClaim.mockResolvedValue(fakeClaim(1, { challenger: "0x" + "33".repeat(20) }));
    const h = await runWatcher({ chains: `${GNOSIS}`, networks: "testnet", path: "challenger", cycles: 1 });
    const { low } = windowOf(GNOSIS, h.now(GNOSIS));
    const budgetOf = (fn: string, epoch: number) =>
      h.calls.find((c) => c.fn === fn && c.epoch === epoch)?.params.scanBudget;
    const resolved = h.calls.filter((c) => c.fn === "challengeAndResolveClaim").map((c) => c.epoch);
    const backlog = resolved.filter((epoch) => epoch < low);
    expect(backlog.length).toBeGreaterThan(0);
    for (const epoch of backlog) expect(budgetOf("challengeAndResolveClaim", epoch)).toBe(budgetOf("getClaim", epoch));
    expect(budgetOf("getClaim", backlog[0])).toBeDefined();
    for (const epoch of resolved.filter((e) => e >= low)) {
      expect(budgetOf("challengeAndResolveClaim", epoch)).toBeUndefined();
    }
  });

  it("an epoch whose scan paused at the budget is undecidable, not failed, and stays watched", async () => {
    const { ClaimScanPausedError } = jest.requireActual("./utils/errors");
    let paused = 0;
    mocks.getClaim.mockImplementation(async ({ epoch }: any) => {
      if (paused === 0) paused = epoch < windowOf(GNOSIS, harness().now(GNOSIS)).low ? epoch : 0;
      if (epoch === paused) throw new ClaimScanPausedError(epoch, 100, 200);
      return null;
    });
    const h = await runWatcher({ chains: `${GNOSIS}`, networks: "testnet", path: "claimer", cycles: 4 });
    expect(paused).toBeGreaterThan(0);
    expect(h.eventsNamed(BotEvents.EPOCH_FAILED).filter((e) => e.epoch === paused)).toEqual([]);
    expect(h.epochsOf("getClaim", 4)).toContain(paused);
    expect(h.state.routes[`${GNOSIS}_testnet`].epochs.get(paused)?.nullStreak).toBe(0);
  });
});

describe("watcher: a transaction left unmined when its handler is dropped", () => {
  // The dropped handler's stuck transaction stays recorded: the next send of ours to that chain
  // re-broadcasts it, byte for byte, and itself goes out fresh behind it.
  // Real handlers, whose sends never land: no receipt, and the signer's latest nonce stays at 7.
  const mockBroadcast = jest.fn();
  const neverMined = {
    getTransactionReceipt: async () => null,
    getTransactionCount: async () => 7,
    sendTransaction: (raw: string) => mockBroadcast(raw),
  };
  beforeEach(() => mockBroadcast.mockReset().mockResolvedValue({}));

  it("the next epoch's snapshot save re-broadcasts, unchanged, the save the dropped handler of the last epoch left unmined", async () => {
    const { ArbToGnosisTransactionHandler } = jest.requireActual("./utils/transactionHandlers/arbToGnosisHandler");
    mocks.getTransactionHandler.mockImplementation(() => ArbToGnosisTransactionHandler);
    mocks.saveSnapshot.mockImplementation(async ({ transactionHandler, count }: any) => {
      await transactionHandler.saveSnapshot();
      return { updatedTransactionHandler: transactionHandler, latestCount: count };
    });
    const first = await signedSend({ nonce: 7, chainId: 421614 });
    const second = await signedSend({ nonce: 8, chainId: 421614 });
    mockSaveSnapshotSend.mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);
    const E = Math.floor(1_760_000_000 / P_GNOSIS);
    const h = await runWatcher({
      chains: `${GNOSIS}`,
      networks: "testnet",
      path: "claimer",
      saveSnapshot: true,
      cycles: 2,
      // Five minutes before epoch E ends, then the same point of epoch E+1.
      now: (E + 1) * P_GNOSIS - 300,
      rpcMethods: (url) => (url === RPC.arb ? neverMined : {}),
      setup: (h) => jest.spyOn(Date, "now").mockImplementation(() => h.now(GNOSIS) * 1000),
      beforeCycle: (cycle, h) => {
        if (cycle === 2) h.advance(P_GNOSIS);
      },
    });
    expect(mockBroadcast.mock.calls).toEqual([[first.raw]]);
    expect(mockSaveSnapshotSend.mock.calls).toEqual([[], []]);
    expect(Object.keys(h.state.transactionHandlers).filter((key) => key.startsWith("snapshot_"))).toEqual([
      snapshotHandlerKey(GNOSIS, Network.TESTNET, E + 1),
    ]);
    expect(h.eventsNamed(BotEvents.ALERT).filter((alert) => alert.code === "NONCE_STUCK")).toEqual([
      expect.objectContaining({
        epoch: E,
        details: expect.objectContaining({ hash: first.response.hash, nonce: 7, contract: "inbox" }),
      }),
    ]);
  });

  it("a devnet advance left unmined at rollover is re-broadcast, unchanged, by a later epoch's advance", async () => {
    const { ArbToEthDevnetTransactionHandler } = jest.requireActual("./utils/transactionHandlers/arbToEthHandler");
    mocks.getTransactionHandler.mockImplementation(() => ArbToEthDevnetTransactionHandler);
    mocks.checkAndClaim.mockImplementation(async ({ transactionHandler }: any) => {
      await transactionHandler.devnetAdvanceState("0x" + "cc".repeat(32));
      return transactionHandler;
    });
    const first = await signedSend({ nonce: 7 });
    const second = await signedSend({ nonce: 8 });
    mockDevnetAdvanceStateSend.mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);
    const { epochPeriod: P, deposit } = getBridgeConfig(SEPOLIA).routeConfig[Network.DEVNET];
    const epochs: number[] = [];
    const h = await runWatcher({
      chains: `${SEPOLIA}`,
      networks: "devnet",
      path: "claimer",
      cycles: 2,
      rpcMethods: (url) => (url === RPC.eth ? neverMined : {}),
      setup: (h) => jest.spyOn(Date, "now").mockImplementation(() => h.now(SEPOLIA) * 1000),
      // Six minutes on: a later epoch, and past MAX_PENDING_TIME since the first advance.
      beforeCycle: (cycle, h) => {
        if (cycle === 2) h.advance(P + 60);
        epochs.push(Math.floor(h.now(SEPOLIA) / P));
      },
    });
    expect(h.eventsNamed(BotEvents.EPOCH_DROPPED)).toContainEqual(
      expect.objectContaining({ epoch: epochs[0], reason: "devnet_rollover" })
    );
    expect(mockBroadcast.mock.calls).toEqual([[first.raw]]);
    expect(mockDevnetAdvanceStateSend.mock.calls.map(([epoch, , overrides]) => [epoch, overrides])).toEqual([
      [epochs[0], { value: deposit }],
      [epochs[1], { value: deposit }],
    ]);
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
