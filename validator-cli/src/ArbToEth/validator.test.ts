import { ethers } from "ethers";
import { challengeAndResolveClaim } from "./validator";
import { BotEvents } from "../utils/botEvents";

describe("validator", () => {
  let veaOutbox: any;
  let veaInbox: any;
  let veaInboxProvider: any;
  let veaOutboxProvider: any;
  let emitter: any;
  let mockClaim: any;
  let mockGetClaimState: any;
  let mockGetBlockFinality: any;
  let mockDeps: any;
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
    mockGetBlockFinality = jest.fn().mockResolvedValue([{ number: 0 }, { number: 0, timestamp: 100 }, false]);
    mockDeps = {
      claim: mockClaim,
      epoch: 0,
      epochPeriod: 10,
      veaInbox,
      veaInboxProvider,
      veaOutboxProvider,
      veaOutbox,
      transactionHandler: null,
      emitter,
      fetchClaimResolveState: mockGetClaimState,
      fetchBlocksAndCheckFinality: mockGetBlockFinality,
    };
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe("challengeAndResolveClaim", () => {
    it("should return null if no claim is made", async () => {
      mockDeps.claim = null;
      const result = await challengeAndResolveClaim(mockDeps);

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
      mockDeps.transactionHandler = mockTransactionHandler;
      const updatedTransactionHandler = await challengeAndResolveClaim(mockDeps);
      expect(updatedTransactionHandler.transactions.challengeTxn).toBe(challengeTxn);
      expect(mockTransactionHandler.challengeClaim).toHaveBeenCalled();
    });

    it("should not challenge if claim is valid", async () => {
      veaInbox.snapshots = jest.fn().mockReturnValue(mockClaim.stateRoot);
      const updatedTransactionHandler = await challengeAndResolveClaim(mockDeps);
      expect(updatedTransactionHandler).toBeNull();
    });

    it("send snapshot if snapshot not sent", async () => {
      mockClaim.challenger = mockClaim.claimer;
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
      mockDeps.transactionHandler = mockTransactionHandler;
      mockDeps.fetchClaimResolveState = mockGetClaimState;
      const updatedTransactionHandler = await challengeAndResolveClaim(mockDeps);
      expect(updatedTransactionHandler.transactions.sendSnapshotTxn).toEqual("0x123");
      expect(mockTransactionHandler.sendSnapshot).toHaveBeenCalled();
      expect(updatedTransactionHandler.claim).toEqual(mockClaim);
    });

    it("resolve challenged claim if snapshot sent but not executed", async () => {
      mockClaim.challenger = mockClaim.claimer;
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
      mockDeps.transactionHandler = mockTransactionHandler;
      mockDeps.fetchClaimResolveState = mockGetClaimState;
      const updatedTransactionHandler = await challengeAndResolveClaim(mockDeps);
      expect(updatedTransactionHandler.transactions.executeSnapshotTxn).toEqual("0x123");
      expect(mockTransactionHandler.resolveChallengedClaim).toHaveBeenCalled();
      expect(updatedTransactionHandler.claim).toEqual(mockClaim);
    });

    it("withdraw challenge deposit if snapshot sent and executed", async () => {
      mockClaim.challenger = mockClaim.claimer;
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
      mockDeps.transactionHandler = mockTransactionHandler;
      mockDeps.fetchClaimResolveState = mockGetClaimState;
      const updatedTransactionHandler = await challengeAndResolveClaim(mockDeps);
      expect(updatedTransactionHandler.transactions.withdrawChallengeDepositTxn).toEqual("0x1234");
      expect(mockTransactionHandler.withdrawChallengeDeposit).toHaveBeenCalled();
      expect(updatedTransactionHandler.claim).toEqual(mockClaim);
    });
  });
});
