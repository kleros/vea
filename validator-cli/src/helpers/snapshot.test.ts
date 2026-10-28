import { Network, snapshotSavingPeriod } from "../consts/bridgeRoutes";
import { isSnapshotNeeded, saveSnapshot, SEND_MARGIN_SECS } from "./snapshot";
import { BotEvents } from "../utils/botEvents";
import { MockEmitter } from "../utils/emitter";
import { ethers } from "ethers";

describe("snapshot", () => {
  const network = Network.TESTNET;
  let veaInbox: any;
  let veaOutbox: any;
  let count: number = 1;
  let epochPeriod = 1200;
  const chainId = 11155111;
  let veaInboxProvider: any;
  let veaOutboxProvider: any;
  const SEC_PER_BLOCK = 12;
  const HEAD_BLOCK = 1_000_000;
  const makeProvider = () => ({
    getBlock: jest.fn(async (tag: any) => {
      const number = typeof tag === "number" ? tag : HEAD_BLOCK;
      return { number, timestamp: number * SEC_PER_BLOCK };
    }),
  });
  let fetchLastSnapshotSaved: jest.Mock;
  let fetchLastClaimedEpoch: jest.Mock;
  let fetchClaimForEpoch: jest.Mock;
  beforeEach(() => {
    veaInbox = {
      count: jest.fn(),
      queryFilter: jest.fn(),
      filters: {
        SnapshotSaved: jest.fn(),
      },
      snapshots: jest.fn(),
      getAddress: jest.fn().mockResolvedValue("0x1"),
    };
    veaOutbox = {
      stateRoot: jest.fn(),
      queryFilter: jest.fn(),
      filters: {
        Claimed: jest.fn(),
      },
    };
    veaInboxProvider = makeProvider();
    veaOutboxProvider = makeProvider();
    fetchLastClaimedEpoch = jest.fn().mockResolvedValue({ epoch: 1 });
    fetchClaimForEpoch = jest.fn().mockResolvedValue({
      stateRoot: "0xabcde",
    });
  });
  describe("isSnapshotNeeded", () => {
    it("should return false and updated count when there are no new messages and count is -1 ", async () => {
      count = -1;
      let currentCount = 1;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSnapshotSaved = jest.fn();
      veaInbox.queryFilter.mockResolvedValue([{ args: ["0x1", "0x2", currentCount] }]);
      veaOutbox.queryFilter.mockResolvedValue([{ data: "0x1", blockNumber: 1 }]);
      const params = {
        network,
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count,
        fetchLastSnapshotSaved,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: false,
        latestCount: currentCount,
      });
    });

    it("bootstraps the first snapshot: no SnapshotSaved on chain and none in the indexer, but messages in the inbox", async () => {
      count = -1;
      veaInbox.count.mockResolvedValue(3);
      veaInbox.queryFilter.mockResolvedValue([]);
      fetchLastSnapshotSaved = jest.fn().mockResolvedValue(null);
      const params = {
        network,
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count,
        fetchLastSnapshotSaved,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({ snapshotNeeded: true, latestCount: 3 });
    });

    it("saves nothing when no snapshot exists anywhere and the inbox is empty", async () => {
      count = -1;
      veaInbox.count.mockResolvedValue(0);
      veaInbox.queryFilter.mockResolvedValue([]);
      fetchLastSnapshotSaved = jest.fn().mockResolvedValue(null);
      const params = {
        network,
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count,
        fetchLastSnapshotSaved,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({ snapshotNeeded: false, latestCount: 0 });
    });

    it("should return false when count is equal to current count", async () => {
      count = 1;
      let currentCount = 1;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSnapshotSaved = jest.fn();
      veaInbox.queryFilter.mockResolvedValue([{ args: ["0x1", "0x2", currentCount] }]);
      const params = {
        network,
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count,
        fetchLastSnapshotSaved,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: false,
        latestCount: count,
      });
    });
    it("should return false if snapshot is saved for the current count", async () => {
      count = 1;
      let currentCount = 2;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSnapshotSaved = jest.fn();
      veaInbox.queryFilter.mockResolvedValue([{ args: ["0x1", "0x2", currentCount] }]);
      veaOutbox.queryFilter.mockResolvedValue([{ args: [null, 1, null] }]);
      const params = {
        network,
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count,
        fetchLastSnapshotSaved,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: false,
        latestCount: currentCount,
      });
    });
    it("should return true if snapshot is needed", async () => {
      count = 1;
      let currentCount = 2;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSnapshotSaved = jest.fn();
      veaInbox.queryFilter.mockResolvedValue([{ args: ["0x1", "0x2", 1] }]);
      veaOutbox.queryFilter.mockResolvedValue([{ args: [null, 1, null] }]);
      const params = {
        network,
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count,
        fetchLastSnapshotSaved,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: true,
        latestCount: currentCount,
      });
    });
    it("scans bounded windows for the last saved snapshot and the last claim", async () => {
      veaInbox.count.mockResolvedValue(2);
      const inboxRanges: Array<[number, number]> = [];
      const outboxRanges: Array<[number, number]> = [];
      veaInbox.queryFilter = jest.fn(async (_f: any, from: number, to: number) => {
        inboxRanges.push([from, to]);
        return [{ args: ["0x1", "0x2", 1], blockNumber: HEAD_BLOCK - 10, index: 0 }];
      });
      veaOutbox.queryFilter = jest.fn(async (_f: any, from: number, to: number) => {
        outboxRanges.push([from, to]);
        return [{ args: [null, 1, null], data: "0xabc", blockNumber: HEAD_BLOCK - 10, index: 0 }];
      });
      veaInbox.snapshots.mockResolvedValue(ethers.ZeroHash);
      veaOutbox.stateRoot.mockResolvedValue("0xstate");
      const params = {
        network,
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count: -1,
        fetchLastSnapshotSaved: jest.fn(),
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;

      await isSnapshotNeeded(params);

      for (const ranges of [inboxRanges, outboxRanges]) {
        expect(ranges.length).toBeGreaterThan(0);
        // ethers defaults an omitted range to fromBlock 0.
        expect(Math.min(...ranges.map((r) => r[0]))).toBeGreaterThan(0);
        for (const [from, to] of ranges) {
          expect(to - from).toBeLessThan(10_000);
          expect(to).toBeLessThanOrEqual(HEAD_BLOCK);
        }
      }
    });

    it("should fallback to fetchLastSnapshotSaved if queryFilter fails", async () => {
      count = 1;
      let currentCount = 2;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSnapshotSaved = jest.fn().mockResolvedValue({ count: 1, stateRoot: "0x1" });
      veaInbox.queryFilter.mockRejectedValue(new Error("queryFilter failed"));
      const params = {
        network,
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count,
        fetchLastSnapshotSaved,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: true,
        latestCount: currentCount,
      });
    });
    it("should return true if claim was missed in previous epoch", async () => {
      count = 1;
      let currentCount = 3;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSnapshotSaved = jest.fn().mockResolvedValue({ count: 3, stateRoot: "0x0" });
      veaInbox.queryFilter.mockRejectedValue(new Error("queryFilter failed"));
      veaOutbox.stateRoot.mockResolvedValue("0xabcde");
      veaInbox.snapshots.mockResolvedValue(ethers.ZeroHash);
      const params = {
        network,
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count,
        fetchLastSnapshotSaved,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: true,
        latestCount: currentCount,
      });
    });
  });

  describe("isSnapshotNeeded: the on-chain SnapshotSaved log and the indexer agree on what a count is", () => {
    const ROOT_SAVED = "0x" + "44".repeat(32);
    const ROOT_OTHER = "0x" + "55".repeat(32);
    const check = (overrides: Record<string, unknown> = {}) =>
      isSnapshotNeeded({
        epochPeriod,
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        count: -1,
        fetchLastSnapshotSaved,
        fetchLastClaimedEpoch,
        ...overrides,
      } as any);
    beforeEach(() => {
      veaInbox.count.mockResolvedValue(5);
      veaInbox.snapshots.mockResolvedValue(ethers.ZeroHash);
      veaOutbox.stateRoot.mockResolvedValue(ROOT_OTHER);
      fetchLastSnapshotSaved = jest.fn();
    });

    it("with no SnapshotSaved log in the lookback, the indexer's last SnapshotSaved count is compared with the inbox count", async () => {
      // Five messages, all saved: the indexer's count is the inbox count it saved, not a 0-based message nonce.
      veaInbox.queryFilter.mockResolvedValue([]);
      veaOutbox.queryFilter.mockResolvedValue([{ data: ROOT_SAVED, blockNumber: 1 }]);
      fetchLastSnapshotSaved.mockResolvedValue({ count: 5, stateRoot: ROOT_SAVED });
      await expect(check()).resolves.toEqual({ snapshotNeeded: false, latestCount: 5 });
      fetchLastSnapshotSaved.mockResolvedValue({ count: 4, stateRoot: ROOT_SAVED });
      await expect(check()).resolves.toEqual({ snapshotNeeded: true, latestCount: 5 });
      expect(fetchLastSnapshotSaved).toHaveBeenCalledWith(veaInbox.target, chainId);
    });

    it("a missing Claimed log keeps the on-chain SnapshotSaved count: a new message is a save, with the indexer down", async () => {
      veaInbox.count.mockResolvedValue(6);
      veaInbox.queryFilter.mockResolvedValue([{ args: [ROOT_SAVED, 1, 5], blockNumber: 1 }]);
      veaOutbox.queryFilter.mockResolvedValue([]);
      fetchLastSnapshotSaved.mockRejectedValue(new Error("indexer timed out"));
      fetchLastClaimedEpoch = jest.fn().mockRejectedValue(new Error("indexer timed out"));
      await expect(check({ fetchLastClaimedEpoch })).resolves.toEqual({ snapshotNeeded: true, latestCount: 6 });
      expect(fetchLastSnapshotSaved).not.toHaveBeenCalled();
      expect(fetchLastClaimedEpoch).not.toHaveBeenCalled();
    });

    it("a missing Claimed log is asked of the indexer only for the missed-claim check, whose failure skips that check alone", async () => {
      veaInbox.queryFilter.mockResolvedValue([{ args: [ROOT_SAVED, 1, 5], blockNumber: 1 }]);
      veaOutbox.queryFilter.mockResolvedValue([]);
      // The saved root was never claimed: saved again in an epoch with no snapshot yet.
      fetchLastClaimedEpoch = jest.fn().mockResolvedValue({ stateRoot: ROOT_OTHER });
      await expect(check({ fetchLastClaimedEpoch })).resolves.toEqual({ snapshotNeeded: true, latestCount: 5 });
      // It was claimed: nothing to save.
      fetchLastClaimedEpoch = jest.fn().mockResolvedValue({ stateRoot: ROOT_SAVED });
      await expect(check({ fetchLastClaimedEpoch })).resolves.toEqual({ snapshotNeeded: false, latestCount: 5 });
      // The indexer cannot tell: no re-save, and no throw. The count passed in comes back, so the
      // next check asks again instead of ending at "no new message" for the rest of the epoch.
      fetchLastClaimedEpoch = jest.fn().mockRejectedValue(new Error("indexer timed out"));
      await expect(check({ fetchLastClaimedEpoch })).resolves.toEqual({ snapshotNeeded: false, latestCount: -1 });
      expect(fetchLastSnapshotSaved).not.toHaveBeenCalled();
    });

    describe("compares roots as bytes: the indexer may spell a root in another hex case", () => {
      const ROOT_LOWER = "0x" + "ab".repeat(32);
      const ROOT_UPPER = "0x" + "AB".repeat(32);

      it("the indexer's saved root is the outbox state root: nothing to save", async () => {
        veaInbox.queryFilter.mockResolvedValue([]);
        veaOutbox.queryFilter.mockResolvedValue([]);
        veaOutbox.stateRoot.mockResolvedValue(ROOT_LOWER);
        fetchLastSnapshotSaved.mockResolvedValue({ count: 5, stateRoot: ROOT_UPPER });
        await expect(check()).resolves.toEqual({ snapshotNeeded: false, latestCount: 5 });
      });

      it("the saved root is the indexer's last claimed root: nothing to save", async () => {
        veaInbox.queryFilter.mockResolvedValue([{ args: [ROOT_LOWER, 1, 5], blockNumber: 1 }]);
        veaOutbox.queryFilter.mockResolvedValue([]);
        fetchLastClaimedEpoch = jest.fn().mockResolvedValue({ stateRoot: ROOT_UPPER });
        await expect(check({ fetchLastClaimedEpoch })).resolves.toEqual({ snapshotNeeded: false, latestCount: 5 });
      });
    });

    it("an indexer failure in the missed-claim check is retried by the next cycle in the saving window, which re-saves", async () => {
      veaInbox.queryFilter.mockResolvedValue([{ args: [ROOT_SAVED, 1, 5], blockNumber: 1 }]);
      veaOutbox.queryFilter.mockResolvedValue([]);
      veaInboxProvider.getBlock.mockImplementation(async (tag: any) => {
        const number = typeof tag === "number" ? tag : HEAD_BLOCK;
        return { number, timestamp: tag === "latest" ? 2 * epochPeriod - 60 : number * SEC_PER_BLOCK };
      });
      fetchLastClaimedEpoch = jest
        .fn()
        .mockRejectedValueOnce(new Error("indexer timed out"))
        .mockResolvedValue({ stateRoot: ROOT_OTHER });
      const transactionHandler = { saveSnapshot: jest.fn() };
      // Cycles in epoch 1's saving window, each passing on the count the one before returned (-1 at its start).
      let count = -1;
      for (let cycle = 0; cycle < 2; cycle++) {
        ({ latestCount: count } = await saveSnapshot({
          chainId,
          veaInbox,
          veaOutbox,
          veaInboxProvider,
          veaOutboxProvider,
          network,
          epochPeriod,
          count,
          transactionHandler,
          emitter: new MockEmitter(),
          now: 2 * epochPeriod - 60,
          toSaveSnapshot: (params) => isSnapshotNeeded({ ...params, fetchLastSnapshotSaved, fetchLastClaimedEpoch }),
        }));
      }
      expect(fetchLastClaimedEpoch).toHaveBeenCalledTimes(2);
      expect(transactionHandler.saveSnapshot).toHaveBeenCalledTimes(1);
    });

    it("with the route's cache, a later check scans only the inbox blocks finalized since, and asks the indexer no more", async () => {
      let finalized = HEAD_BLOCK;
      veaInboxProvider.getBlock.mockImplementation(async (tag: any) => {
        const number = typeof tag === "number" ? tag : finalized;
        return { number, timestamp: number * SEC_PER_BLOCK };
      });
      // A quiet inbox: no SnapshotSaved in the lookback, so the indexer tells the last one.
      const saves: Array<{ blockNumber: number; args: [string, number, number] }> = [];
      const inboxRanges: Array<[number, number]> = [];
      veaInbox.queryFilter = jest.fn(async (_f: any, from: number, to: number) => {
        inboxRanges.push([from, to]);
        return saves.filter((log) => log.blockNumber >= from && log.blockNumber <= to);
      });
      veaOutbox.queryFilter.mockResolvedValue([{ data: ROOT_SAVED, blockNumber: 1 }]);
      fetchLastSnapshotSaved.mockResolvedValue({ count: 5, stateRoot: ROOT_SAVED });
      const savedCache = {};

      await expect(check({ savedCache })).resolves.toEqual({ snapshotNeeded: false, latestCount: 5 });
      // The whole lookback, chunk by chunk.
      expect(inboxRanges.length).toBeGreaterThan(5);

      // A new epoch (count -1 again), 300 blocks later.
      finalized += 300;
      inboxRanges.length = 0;
      await expect(check({ savedCache })).resolves.toEqual({ snapshotNeeded: false, latestCount: 5 });
      expect(inboxRanges).toEqual([[HEAD_BLOCK + 1, HEAD_BLOCK + 300]]);
      expect(fetchLastSnapshotSaved).toHaveBeenCalledTimes(1);

      // A message arrives and is saved: found by the forward scan.
      veaInbox.count.mockResolvedValue(7);
      saves.push({ blockNumber: HEAD_BLOCK + 350, args: [ROOT_OTHER, 2, 6] });
      finalized += 100;
      inboxRanges.length = 0;
      await expect(check({ savedCache })).resolves.toEqual({ snapshotNeeded: true, latestCount: 7 });
      expect(inboxRanges).toEqual([[HEAD_BLOCK + 301, HEAD_BLOCK + 400]]);
      expect(savedCache).toEqual({ scannedTo: HEAD_BLOCK + 400, lastSaved: { count: 6, stateRoot: ROOT_OTHER } });
      expect(fetchLastSnapshotSaved).toHaveBeenCalledTimes(1);
    });

    it("a failed scan leaves the cache as it was: the indexer answers that check alone", async () => {
      const savedCache = { scannedTo: HEAD_BLOCK - 10, lastSaved: { count: 5, stateRoot: ROOT_SAVED } };
      veaInbox.queryFilter.mockRejectedValue(new Error("rpc down"));
      veaOutbox.queryFilter.mockResolvedValue([{ data: ROOT_SAVED, blockNumber: 1 }]);
      fetchLastSnapshotSaved.mockResolvedValue({ count: 4, stateRoot: ROOT_SAVED });
      await expect(check({ savedCache })).resolves.toEqual({ snapshotNeeded: true, latestCount: 5 });
      expect(savedCache).toEqual({ scannedTo: HEAD_BLOCK - 10, lastSaved: { count: 5, stateRoot: ROOT_SAVED } });
    });

    it("with neither a SnapshotSaved log nor an answer from the indexer, it throws: nothing tells what was saved", async () => {
      veaInbox.queryFilter.mockResolvedValue([]);
      fetchLastSnapshotSaved.mockRejectedValue(new Error("indexer timed out"));
      await expect(check()).rejects.toThrow("indexer timed out");
    });
  });

  describe("saveSnapshot", () => {
    const network = Network.TESTNET;
    const epochPeriod = 1200;

    it("should not save snapshot if time left for epoch is greater than 600 seconds", async () => {
      veaInbox.count.mockResolvedValue(count + 1);
      const now = 1220; // 20 seconds after the epoch started
      const transactionHandler = {
        saveSnapshot: jest.fn(),
      };
      const res = await saveSnapshot({
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        network,
        epochPeriod,
        count,
        transactionHandler,
        emitter: new MockEmitter(),
        now,
      });

      expect(transactionHandler.saveSnapshot).not.toHaveBeenCalled();
      expect(res).toEqual({ transactionHandler, latestCount: count });
    });

    it("should save snapshot if time left for epoch is less than 600 seconds", async () => {
      const currentCount = 6; // contract count
      count = -1;
      veaInbox.count.mockResolvedValue(currentCount);
      const now = 1801; // 601 seconds after the epoch started
      veaInboxProvider.getBlock.mockResolvedValue({ number: 150, timestamp: now });
      const isSnapshotNeededMock = jest.fn().mockResolvedValue({
        snapshotNeeded: true,
        latestCount: currentCount,
      });
      const transactionHandler = {
        saveSnapshot: jest.fn(),
      };
      const res = await saveSnapshot({
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        network,
        epochPeriod,
        count,
        transactionHandler,
        emitter: new MockEmitter(),
        now,
        toSaveSnapshot: isSnapshotNeededMock,
      });
      // Told the inbox count to cover, so a mined save of fewer messages is superseded.
      expect(transactionHandler.saveSnapshot).toHaveBeenCalledWith(currentCount);
      // The count passed in, not the inbox's: the save may not land, so the next cycle re-checks.
      expect(res).toEqual({ transactionHandler, latestCount: count });
    });

    it("should not save snapshot if snapshot is needed", async () => {
      const currentCount = 6;
      veaInbox.count.mockResolvedValue(currentCount);
      const isSnapshotNeededMock = jest.fn().mockResolvedValue({
        snapshotNeeded: false,
        latestCount: currentCount,
      });
      const now = 1801; // 601 seconds after the epoch started
      const transactionHandler = {
        saveSnapshot: jest.fn(),
      };
      const res = await saveSnapshot({
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        network,
        epochPeriod,
        count: -1,
        transactionHandler,
        emitter: new MockEmitter(),
        now,
        toSaveSnapshot: isSnapshotNeededMock,
      });
      expect(transactionHandler.saveSnapshot).not.toHaveBeenCalled();
      expect(res).toEqual({ transactionHandler, latestCount: currentCount });
    });

    it("does not send when the inbox chain's epoch has ended (or is about to) since the decision", async () => {
      const now = 2 * epochPeriod - 120; // inside epoch 1's saving window when the cycle started
      const transactionHandler = { saveSnapshot: jest.fn() };
      const emitter = new MockEmitter();
      const emitted = jest.spyOn(emitter, "emit");
      const run = () =>
        saveSnapshot({
          chainId,
          veaInbox,
          veaOutbox,
          veaInboxProvider,
          veaOutboxProvider,
          network,
          epochPeriod,
          count: 5,
          transactionHandler,
          emitter,
          now,
          toSaveSnapshot: jest.fn().mockResolvedValue({ snapshotNeeded: true, latestCount: 6 }),
        });

      // The checks took minutes: the inbox chain is already in epoch 2.
      veaInboxProvider.getBlock.mockResolvedValue({ number: 300, timestamp: 2 * epochPeriod + 5 });
      expect(await run()).toEqual({ transactionHandler, latestCount: 5 });
      // Within the send margin of the epoch's end.
      veaInboxProvider.getBlock.mockResolvedValue({ number: 300, timestamp: 2 * epochPeriod - SEND_MARGIN_SECS });
      expect(await run()).toEqual({ transactionHandler, latestCount: 5 });

      expect(transactionHandler.saveSnapshot).not.toHaveBeenCalled();
      expect(emitted).toHaveBeenCalledWith(
        BotEvents.ALERT,
        expect.objectContaining({ code: "SNAPSHOT_EPOCH_ENDED", epoch: 1 })
      );
    });

    it("should save snapshot in time limit for devnet", async () => {
      const savingPeriod = snapshotSavingPeriod[Network.DEVNET];
      const currentCount = 6;
      count = -1;
      veaInbox.count.mockResolvedValue(currentCount);
      const isSnapshotNeededMock = jest.fn().mockResolvedValue({
        snapshotNeeded: true,
        latestCount: currentCount,
      });
      const now = epochPeriod + epochPeriod - savingPeriod; // 60 seconds before the second epoch ends
      veaInboxProvider.getBlock.mockResolvedValue({ number: 200, timestamp: now });
      const transactionHandler = {
        saveSnapshot: jest.fn(),
      };
      const res = await saveSnapshot({
        chainId,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        network: Network.DEVNET,
        epochPeriod,
        count,
        transactionHandler,
        emitter: new MockEmitter(),
        now,
        toSaveSnapshot: isSnapshotNeededMock,
      });
      expect(transactionHandler.saveSnapshot).toHaveBeenCalled();
      expect(res).toEqual({ transactionHandler, latestCount: count });
    });
  });
});

// Snapshot saving decides from chain time, never the host clock.
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

describe("snapshot: chain time, not the host clock", () => {
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
        fetchLastSnapshotSaved: jest.fn().mockResolvedValue({ count: 5, stateRoot: "0x" + "33".repeat(32) }),
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
      fetchLastSnapshotSaved: jest.fn().mockResolvedValue({ count: 5, stateRoot: "0x" + "33".repeat(32) }),
      fetchLastClaimedEpoch: jest.fn().mockResolvedValue(null),
    });
    expect(veaInbox.snapshots).toHaveBeenCalledWith(EPOCH);
    expect(outboxProvider.getBlock).not.toHaveBeenCalledWith("latest");
  });
});

describe("snapshot: a sent save is checked on chain again until it lands", () => {
  const ROOT_SAVED = "0x" + "44".repeat(32);
  const ROOT_CLAIMED = "0x" + "55".repeat(32);
  const HEAD = 1_000_000;
  // A chain whose head is at `now`, 12 s per block.
  const chainAt = (now: number) => ({
    getBlock: jest.fn(async (tag: any) => {
      const number = typeof tag === "number" ? tag : HEAD;
      return { number, timestamp: now - (HEAD - number) * 12 };
    }),
  });
  // The inbox holds `count` messages while its last SnapshotSaved covers only `savedCount`;
  // `snapshot` is what this epoch's `snapshots(epoch)` holds.
  const onChain = (chain: { count: number; savedCount: number; snapshot?: string }) => ({
    veaInbox: {
      count: jest.fn(async () => chain.count),
      filters: { SnapshotSaved: jest.fn() },
      queryFilter: jest.fn(async (_f: any, _from: number, to: number) => [
        { args: [ROOT_SAVED, EPOCH - 1, chain.savedCount], blockNumber: to, index: 0 },
      ]),
      snapshots: jest.fn(async () => chain.snapshot ?? ethers.ZeroHash),
      target: "0xinbox",
    },
    veaOutbox: {
      stateRoot: jest.fn().mockResolvedValue(ROOT_CLAIMED),
      filters: { Claimed: jest.fn() },
      queryFilter: jest.fn(async (_f: any, _from: number, to: number) => [
        { data: ROOT_CLAIMED, blockNumber: to, index: 0 },
      ]),
      target: "0xoutbox",
    },
  });
  const cycle = (contracts: ReturnType<typeof onChain>, transactionHandler: any, count: number) =>
    saveSnapshot({
      chainId: 11155111,
      ...contracts,
      veaInboxProvider: chainAt(CHAIN_NOW) as any,
      veaOutboxProvider: chainAt(CHAIN_NOW) as any,
      network: Network.TESTNET,
      epochPeriod: P,
      count,
      transactionHandler,
      emitter: new MockEmitter(),
      now: CHAIN_NOW,
    });

  it("a save that was sent and never landed is offered to the handler again next cycle", async () => {
    // Five messages, the last snapshot saved three: a save is needed, and the one sent never lands.
    const contracts = onChain({ count: 5, savedCount: 3 });
    const transactionHandler = { saveSnapshot: jest.fn() };

    const first = await cycle(contracts, transactionHandler, -1);
    expect(transactionHandler.saveSnapshot).toHaveBeenCalledTimes(1);
    // Not the inbox's count: caching it would end every later check at `count == currentCount`.
    expect(first.latestCount).toBe(-1);

    // The watcher passes back what it was given. The chain still shows no save of 5, so the
    // handler is asked again; whether it re-sends is its call (a save still in flight is not).
    const second = await cycle(contracts, transactionHandler, first.latestCount);
    expect(transactionHandler.saveSnapshot).toHaveBeenCalledTimes(2);
    expect(second.latestCount).toBe(-1);
  });

  it("once the save shows on chain, the count is cached and the next cycle stops at it", async () => {
    const chain: { count: number; savedCount: number; snapshot?: string } = { count: 5, savedCount: 3 };
    const contracts = onChain(chain);
    const transactionHandler = { saveSnapshot: jest.fn() };

    const sent = await cycle(contracts, transactionHandler, -1);
    // The save lands: this epoch's snapshot is set and the last SnapshotSaved covers all five.
    Object.assign(chain, { savedCount: 5, snapshot: ROOT_SAVED });
    const landed = await cycle(contracts, transactionHandler, sent.latestCount);
    expect(landed.latestCount).toBe(5);
    const reads = contracts.veaInbox.queryFilter.mock.calls.length;

    await cycle(contracts, transactionHandler, landed.latestCount);
    expect(transactionHandler.saveSnapshot).toHaveBeenCalledTimes(1);
    // Within the epoch the cached count still short-circuits: no log scan.
    expect(contracts.veaInbox.queryFilter.mock.calls.length).toBe(reads);
  });
});
