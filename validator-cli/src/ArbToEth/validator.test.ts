import { ethers } from "ethers";
import { challengeAndResolveClaim } from "./validator";
import { BotEvents } from "../utils/botEvents";

describe("validator", () => {
  let veaOutbox: any;
  let veaInbox: any;
  let veaInboxProvider: any;
  let veaOutboxProvider: any;
  let emitter: any;
  let mockGetClaim: any;
  let mockClaim: any;
  let mockGetClaimState: any;
  let mockGetBlockFinality: any;

  beforeEach(() => {
    veaInbox = {
      snapshots: jest.fn(),
      provider: {
        getBlock: jest.fn(),
      },
    };
    veaOutbox = {
      claimHashes: jest.fn(),
      queryFilter: jest.fn(),
      provider: {
        getBlock: jest.fn(),
      },
    };
    emitter = {
      emit: jest.fn(),
    };
    mockClaim = {
      stateRoot: "0x1234",
      claimer: "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288",
      timestampClaimed: 1234,
      timestampVerification: 0,
      blocknumberVerification: 0,
      honest: 0,
      challenger: ethers.ZeroAddress,
    };
    mockGetClaim = jest.fn();
    mockGetBlockFinality = jest.fn().mockResolvedValue([{ number: 0 }, { number: 0, timestamp: 100 }, false]);
  });
  describe("challengeAndResolveClaim", () => {
    it("should return null if no claim is made", async () => {
      const transactionHandler = null;
      mockGetClaim = jest.fn().mockReturnValue(null);
      const result = await challengeAndResolveClaim(
        0,
        10,
        veaInbox,
        veaInboxProvider,
        veaOutbox,
        veaOutboxProvider,
        transactionHandler,
        emitter,
        mockGetClaim,
        mockGetClaimState,
        mockGetBlockFinality
      );

      expect(result).toBeNull();
      expect(emitter.emit).toHaveBeenCalledWith(BotEvents.NO_CLAIM, 0);
    });

    it("should challenge if claim is invalid and not challenged", async () => {
      const challengeTxn = "0x123";
      const mockTransactionHandler = {
        challengeClaim: jest.fn().mockImplementation(() => {
          mockTransactionHandler.transactions.challengeTxn = challengeTxn;
          return Promise.resolve();
        }),
        transactions: {
          challengeTxn: "0x0",
        },
      };
      veaInbox.snapshots = jest.fn().mockReturnValue("0x321");
      mockGetClaim = jest.fn().mockReturnValue(mockClaim);
      const updatedTransactionHandler = await challengeAndResolveClaim(
        0,
        10,
        veaInbox,
        veaInboxProvider,
        veaOutbox,
        veaOutboxProvider,
        mockTransactionHandler as any,
        emitter,
        mockGetClaim,
        mockGetClaimState,
        mockGetBlockFinality
      );
      expect(updatedTransactionHandler.transactions.challengeTxn).toBe(challengeTxn);
      expect(mockTransactionHandler.challengeClaim).toHaveBeenCalled();
    });

    it("should not challenge if claim is valid", async () => {
      mockClaim.challenger = mockClaim.claimer;
      mockGetClaim = jest.fn().mockReturnValue(mockClaim);
      veaInbox.snapshots = jest.fn().mockReturnValue(mockClaim.stateRoot);
      const updatedTransactionHandler = await challengeAndResolveClaim(
        0,
        10,
        veaInbox,
        veaInboxProvider,
        veaOutbox,
        veaOutboxProvider,
        null,
        emitter,
        mockGetClaim,
        mockGetClaimState,
        mockGetBlockFinality
      );
      expect(updatedTransactionHandler).toBeNull();
    });

    it("send snapshot if snapshot not sent", async () => {
      mockClaim.challenger = mockClaim.claimer;
      mockGetClaim = jest.fn().mockReturnValue(mockClaim);
      mockGetClaimState = jest
        .fn()
        .mockReturnValue({ sendSnapshot: { status: false, txnHash: "" }, execution: { status: 0, txnHash: "" } });
      veaInbox.snapshots = jest.fn().mockReturnValue("0x0");
      const mockTransactionHandler = {
        sendSnapshot: jest.fn().mockImplementation(() => {
          mockTransactionHandler.transactions.sendSnapshotTxn = "0x123";
          return Promise.resolve();
        }),
        transactions: {
          sendSnapshotTxn: "0x0",
        },
      };
      const updatedTransactionHandler = await challengeAndResolveClaim(
        0,
        10,
        veaInbox,
        veaInboxProvider,
        veaOutbox,
        veaOutboxProvider,
        mockTransactionHandler as any,
        emitter,
        mockGetClaim,
        mockGetClaimState,
        mockGetBlockFinality
      );
      expect(updatedTransactionHandler.transactions.sendSnapshotTxn).toEqual("0x123");
      expect(mockTransactionHandler.sendSnapshot).toHaveBeenCalled();
      expect(updatedTransactionHandler.claim).toEqual(mockClaim);
    });

    it("resolve challenged claim if snapshot sent but not executed", async () => {
      mockClaim.challenger = mockClaim.claimer;
      mockGetClaim = jest.fn().mockReturnValue(mockClaim);
      mockGetClaimState = jest
        .fn()
        .mockReturnValue({ sendSnapshot: { status: true, txnHash: "0x123" }, execution: { status: 1, txnHash: "" } });
      veaInbox.snapshots = jest.fn().mockReturnValue("0x0");
      const mockTransactionHandler = {
        resolveChallengedClaim: jest.fn().mockImplementation(() => {
          mockTransactionHandler.transactions.executeSnapshotTxn = "0x123";
          return Promise.resolve();
        }),
        transactions: {
          executeSnapshotTxn: "0x0",
        },
      };
      const updatedTransactionHandler = await challengeAndResolveClaim(
        0,
        10,
        veaInbox,
        veaInboxProvider,
        veaOutbox,
        veaOutboxProvider,
        mockTransactionHandler as any,
        emitter,
        mockGetClaim,
        mockGetClaimState,
        mockGetBlockFinality
      );
      expect(updatedTransactionHandler.transactions.executeSnapshotTxn).toEqual("0x123");
      expect(mockTransactionHandler.resolveChallengedClaim).toHaveBeenCalled();
      expect(updatedTransactionHandler.claim).toEqual(mockClaim);
    });

    it("withdraw challenge deposit if snapshot sent and executed", async () => {
      mockClaim.challenger = mockClaim.claimer;
      mockGetClaim = jest.fn().mockReturnValue(mockClaim);
      mockGetClaimState = jest.fn().mockReturnValue({
        sendSnapshot: { status: true, txnHash: "0x123" },
        execution: { status: 2, txnHash: "0x321" },
      });
      veaInbox.snapshots = jest.fn().mockReturnValue("0x0");
      const mockTransactionHandler = {
        withdrawChallengeDeposit: jest.fn().mockImplementation(() => {
          mockTransactionHandler.transactions.withdrawChallengeDepositTxn = "0x1234";
          return Promise.resolve();
        }),
        transactions: {
          withdrawChallengeDepositTxn: "0x0",
        },
      };
      const updatedTransactionHandler = await challengeAndResolveClaim(
        0,
        10,
        veaInbox,
        veaInboxProvider,
        veaOutbox,
        veaOutboxProvider,
        mockTransactionHandler as any,
        emitter,
        mockGetClaim,
        mockGetClaimState,
        mockGetBlockFinality
      );
      expect(updatedTransactionHandler.transactions.withdrawChallengeDepositTxn).toEqual("0x1234");
      expect(mockTransactionHandler.withdrawChallengeDeposit).toHaveBeenCalled();
      expect(updatedTransactionHandler.claim).toEqual(mockClaim);
    });
  });
});
