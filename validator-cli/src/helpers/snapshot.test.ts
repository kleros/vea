import { Network, snapshotSavingPeriod } from "../consts/bridgeRoutes";
import { isSnapshotNeeded, saveSnapshot } from "./snapshot";
import { MockEmitter } from "../utils/emitter";

describe("snapshot", () => {
  let veaInbox: any;
  let veaOutbox: any;
  let count: number = 1;
  const chainId = 11155111;
  let fetchLastSavedMessage: jest.Mock;
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
    };
  });
  describe("isSnapshotNeeded", () => {
    it("should return false and updated count when there are no new messages and count is -1 ", () => {
      count = -1;
      let currentCount = 1;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSavedMessage = jest.fn();
      veaInbox.queryFilter.mockResolvedValue([{ args: ["0x1", "0x2", currentCount] }]);
      const params = {
        chainId,
        veaInbox,
        veaOutbox,
        count,
        fetchLastSavedMessage,
      } as any;
      expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: false,
        latestCount: currentCount,
      });
    });

    it("should return false when count is equal to current count", () => {
      count = 1;
      let currentCount = 1;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSavedMessage = jest.fn();
      veaInbox.queryFilter.mockResolvedValue([{ args: ["0x1", "0x2", currentCount] }]);
      const params = {
        chainId,
        veaInbox,
        veaOutbox,
        count,
        fetchLastSavedMessage,
      } as any;
      expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: false,
        latestCount: count,
      });
    });
    it("should return false if snapshot is saved for the current count", () => {
      count = 1;
      let currentCount = 2;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSavedMessage = jest.fn();
      veaInbox.queryFilter.mockResolvedValue([{ args: ["0x1", "0x2", currentCount] }]);
      const params = {
        chainId,
        veaInbox,
        veaOutbox,
        count,
        fetchLastSavedMessage,
      } as any;
      expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: false,
        latestCount: currentCount,
      });
    });
    it("should return true if snapshot is needed", () => {
      count = 1;
      let currentCount = 2;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSavedMessage = jest.fn();
      veaInbox.queryFilter.mockResolvedValue([{ args: ["0x1", "0x2", 1] }]);
      const params = {
        chainId,
        veaInbox,
        veaOutbox,
        count,
        fetchLastSavedMessage,
      } as any;
      expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: true,
        latestCount: currentCount,
      });
    });
    it("should fallback to fetchLastSavedMessage if queryFilter fails", () => {
      count = 1;
      let currentCount = 2;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSavedMessage = jest.fn().mockResolvedValue("message-0");
      veaInbox.queryFilter.mockRejectedValue(new Error("queryFilter failed"));
      const params = {
        chainId,
        veaInbox,
        veaOutbox,
        count,
        fetchLastSavedMessage,
      } as any;
      expect(isSnapshotNeeded(params)).resolves.toEqual({
        snapshotNeeded: true,
        latestCount: currentCount,
      });
    });
    it.only("should return true if claim was missed in previous epoch", async () => {
      count = 1;
      let currentCount = 3;
      veaInbox.count.mockResolvedValue(currentCount);
      fetchLastSavedMessage = jest.fn().mockResolvedValue("message-3");
      veaInbox.queryFilter.mockRejectedValue(new Error("queryFilter failed"));
      veaOutbox.stateRoot.mockResolvedValue("0xabcde");
      veaInbox.snapshots.mockResolvedValue("0x0");
      const params = {
        chainId,
        veaInbox,
        veaOutbox,
        count,
        fetchLastSavedMessage,
      } as any;
      expect(isSnapshotNeeded(params)).resolves.toEqual({
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
