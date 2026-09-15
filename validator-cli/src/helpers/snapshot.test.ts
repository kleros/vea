import { Network, snapshotSavingPeriod } from "../consts/bridgeRoutes";
import { isSnapshotNeeded, saveSnapshot } from "./snapshot";
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
  let fetchLastSavedMessage: jest.Mock;
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
      fetchLastSavedMessage = jest.fn();
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
        fetchLastSavedMessage,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: false,
        latestCount: currentCount,
      });
    });

    it("should return false when count is equal to current count", async () => {
      count = 1;
      let currentCount = 1;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSavedMessage = jest.fn();
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
        fetchLastSavedMessage,
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
      fetchLastSavedMessage = jest.fn();
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
        fetchLastSavedMessage,
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
      fetchLastSavedMessage = jest.fn();
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
        fetchLastSavedMessage,
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
        fetchLastSavedMessage: jest.fn(),
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

    it("should fallback to fetchLastSavedMessage if queryFilter fails", async () => {
      count = 1;
      let currentCount = 2;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSavedMessage = jest.fn().mockResolvedValue({ id: "message-0", stateRoot: "0x1" });
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
        fetchLastSavedMessage,
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
      fetchLastSavedMessage = jest.fn().mockResolvedValue({ id: "message-3", stateRoot: "0x0" });
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
        fetchLastSavedMessage,
        fetchLastClaimedEpoch,
        fetchClaimForEpoch,
      } as any;
      await expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: true,
        latestCount: currentCount,
      });
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
      expect(transactionHandler.saveSnapshot).toHaveBeenCalled();
      expect(res).toEqual({ transactionHandler, latestCount: currentCount });
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
      expect(res).toEqual({ transactionHandler, latestCount: currentCount });
    });
  });
});
