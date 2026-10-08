import { ethers } from "ethers";
import { Network, snapshotSavingPeriod } from "../../consts/bridgeRoutes";
import { isSnapshotNeeded, saveSnapshot } from "../../helpers/snapshot";
import { MockEmitter } from "../../utils/emitter";

// run-001 #3 (PRD 4.2): snapshot saving decides from chain time, never the host clock.
const P = 3600;
const SAVING_PERIOD = snapshotSavingPeriod[Network.TESTNET];
const SKEW = 30 * 60;
// Chain time inside the saving window of epoch E: SAVING_PERIOD / 2 seconds before (E+1)·P.
const EPOCH = 488_888;
const CHAIN_NOW = (EPOCH + 1) * P - SAVING_PERIOD / 2;

const provider = (timestamp: number) => ({
  getBlock: jest.fn(async (tag: any) => ({ number: typeof tag === "number" ? tag : 1_000, timestamp })),
});

const contracts = () => ({
  veaInbox: {
    count: jest.fn().mockResolvedValue(5),
    queryFilter: jest.fn().mockRejectedValue(new Error("no logs")),
    filters: { SnapshotSaved: jest.fn() },
    snapshots: jest.fn().mockResolvedValue(ethers.ZeroHash),
    target: "0xinbox",
  },
  veaOutbox: {
    stateRoot: jest.fn().mockResolvedValue("0x" + "22".repeat(32)),
    queryFilter: jest.fn(),
    filters: { Claimed: jest.fn() },
    target: "0xoutbox",
  },
});

describe("run-001 #3: snapshot saving uses chain time", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask", "setImmediate"] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ["ahead", SKEW],
    ["behind", -SKEW],
  ])(
    "saveSnapshot without now saves inside the chain's saving window with the host clock 30 minutes %s",
    async (_name, skew) => {
      jest.setSystemTime((CHAIN_NOW + skew) * 1000);
      // The host clock alone would put us outside the window.
      const hostLeft = P - (Math.floor(Date.now() / 1000) % P);
      expect(hostLeft).toBeGreaterThan(SAVING_PERIOD);

      const { veaInbox, veaOutbox } = contracts();
      const transactionHandler = { saveSnapshot: jest.fn() };
      const toSaveSnapshot = jest.fn().mockResolvedValue({ snapshotNeeded: true, latestCount: 5 });
      await saveSnapshot({
        chainId: 11155111,
        veaInbox,
        veaOutbox,
        veaInboxProvider: provider(CHAIN_NOW + 3) as any,
        veaOutboxProvider: provider(CHAIN_NOW) as any,
        network: Network.TESTNET,
        epochPeriod: P,
        count: 4,
        transactionHandler,
        emitter: new MockEmitter(),
        toSaveSnapshot,
      });
      expect(transactionHandler.saveSnapshot).toHaveBeenCalled();
      // The same chain time reaches the snapshot check.
      expect(toSaveSnapshot.mock.calls[0][0].now).toBe(CHAIN_NOW);
    }
  );

  it("saveSnapshot without now waits outside the chain's saving window even when the host clock is inside it", async () => {
    const chainNow = CHAIN_NOW - SKEW; // 30 minutes earlier on chain: well outside the window
    jest.setSystemTime(CHAIN_NOW * 1000);
    const { veaInbox, veaOutbox } = contracts();
    const transactionHandler = { saveSnapshot: jest.fn() };
    const toSaveSnapshot = jest.fn();
    await saveSnapshot({
      chainId: 11155111,
      veaInbox,
      veaOutbox,
      veaInboxProvider: provider(chainNow) as any,
      veaOutboxProvider: provider(chainNow) as any,
      network: Network.TESTNET,
      epochPeriod: P,
      count: 4,
      transactionHandler,
      emitter: new MockEmitter(),
      toSaveSnapshot,
    });
    expect(toSaveSnapshot).not.toHaveBeenCalled();
    expect(transactionHandler.saveSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    // Late in epoch E on chain, the host clock is already in E+1.
    ["ahead", SKEW, CHAIN_NOW],
    // Early in epoch E on chain, the host clock is still in E-1.
    ["behind", -SKEW, EPOCH * P + SAVING_PERIOD / 2],
  ])(
    "isSnapshotNeeded without now reads snapshots of the chain's current epoch (host clock %s)",
    async (_name, skew, chainNow) => {
      jest.setSystemTime((chainNow + skew) * 1000);
      expect(Math.floor(Date.now() / 1000 / P)).not.toBe(EPOCH);
      const { veaInbox, veaOutbox } = contracts();
      await isSnapshotNeeded({
        epochPeriod: P,
        chainId: 11155111,
        veaInbox,
        veaOutbox,
        veaInboxProvider: provider(chainNow) as any,
        veaOutboxProvider: provider(chainNow) as any,
        count: 4,
        fetchLastSavedMessage: jest.fn().mockResolvedValue({ id: "msg-5", stateRoot: "0x" + "33".repeat(32) }),
        fetchLastClaimedEpoch: jest.fn().mockResolvedValue(null),
      });
      expect(veaInbox.snapshots).toHaveBeenCalledWith(EPOCH);
    }
  );

  it("isSnapshotNeeded uses the now it is given (seconds), as the watcher passes it", async () => {
    jest.setSystemTime((CHAIN_NOW + SKEW) * 1000);
    const { veaInbox, veaOutbox } = contracts();
    const outboxProvider = provider(0);
    await isSnapshotNeeded({
      epochPeriod: P,
      chainId: 11155111,
      veaInbox,
      veaOutbox,
      veaInboxProvider: provider(0) as any,
      veaOutboxProvider: outboxProvider as any,
      count: 4,
      now: CHAIN_NOW,
      fetchLastSavedMessage: jest.fn().mockResolvedValue({ id: "msg-5", stateRoot: "0x" + "33".repeat(32) }),
      fetchLastClaimedEpoch: jest.fn().mockResolvedValue(null),
    });
    expect(veaInbox.snapshots).toHaveBeenCalledWith(EPOCH);
    expect(outboxProvider.getBlock).not.toHaveBeenCalledWith("latest");
  });
});
