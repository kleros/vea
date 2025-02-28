import { ethers } from "ethers";
import { checkAndClaim } from "./claimer";
import { ClaimHonestState } from "../utils/claim";

describe("claimer", () => {
  let veaOutbox: any;
  let veaInbox: any;
  let veaInboxProvider: any;
  let veaOutboxProvider: any;
  let emitter: any;
  let mockClaim: any;
  let mockGetLatestClaimedEpoch: any;
  let mockDeps: any;
  beforeEach(() => {
    mockClaim = {
      stateRoot: "0x1234",
      claimer: "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288",
      timestampClaimed: 1234,
      timestampVerification: 0,
      blocknumberVerification: 0,
      honest: 0,
      challenger: ethers.ZeroAddress,
    };
    veaInbox = {
      snapshots: jest.fn().mockResolvedValue(mockClaim.stateRoot),
    };

    veaOutbox = {
      stateRoot: jest.fn().mockResolvedValue(mockClaim.stateRoot),
    };
    veaOutboxProvider = {
      getBlock: jest.fn().mockResolvedValue({ number: 0, timestamp: 110 }),
    };
    emitter = {
      emit: jest.fn(),
    };

    mockGetLatestClaimedEpoch = jest.fn();
    mockDeps = {
      claim: mockClaim,
      epoch: 10,
      epochPeriod: 10,
      veaInbox,
      veaInboxProvider,
      veaOutboxProvider,
      veaOutbox,
      transactionHandler: null,
      emitter,
      fetchLatestClaimedEpoch: mockGetLatestClaimedEpoch,
    };
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe("checkAndClaim", () => {
    let mockTransactionHandler: any;
    const mockTransactions = {
      claimTxn: "0x111",
      withdrawClaimDepositTxn: "0x222",
      startVerificationTxn: "0x333",
      verifySnapshotTxn: "0x444",
    };
    beforeEach(() => {
      mockTransactionHandler = {
        withdrawClaimDeposit: jest.fn().mockImplementation(() => {
          mockTransactionHandler.transactions.withdrawClaimDepositTxn = mockTransactions.withdrawClaimDepositTxn;
          return Promise.resolve();
        }),
        makeClaim: jest.fn().mockImplementation(() => {
          mockTransactionHandler.transactions.claimTxn = mockTransactions.claimTxn;
          return Promise.resolve();
        }),
        startVerification: jest.fn().mockImplementation(() => {
          mockTransactionHandler.transactions.startVerificationTxn = mockTransactions.startVerificationTxn;
          return Promise.resolve();
        }),
        verifySnapshot: jest.fn().mockImplementation(() => {
          mockTransactionHandler.transactions.verifySnapshotTxn = mockTransactions.verifySnapshotTxn;
          return Promise.resolve();
        }),
        transactions: {
          claimTxn: "0x0",
          withdrawClaimDepositTxn: "0x0",
          startVerificationTxn: "0x0",
          verifySnapshotTxn: "0x0",
        },
      };
    });
    it("should return null if no claim is made for a passed epoch", async () => {
      mockDeps.epoch = 7; // claimable epoch - 3
      mockDeps.claim = null;
      const result = await checkAndClaim(mockDeps);
      expect(result).toBeNull();
    });
    it("should return null if no snapshot is saved on the inbox for a claimable epoch", async () => {
      veaInbox.snapshots = jest.fn().mockResolvedValue(ethers.ZeroHash);
      mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
        challenged: false,
        stateroot: "0x1111",
      });
      mockDeps.claim = null;
      mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
      const result = await checkAndClaim(mockDeps);
      expect(result).toBeNull();
    });
    it("should return null if there are no new messages in the inbox", async () => {
      veaInbox.snapshots = jest.fn().mockResolvedValue(mockClaim.stateRoot);
      mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
        challenged: false,
        stateroot: "0x1111",
      });
      mockDeps.claim = null;
      mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
      const result = await checkAndClaim(mockDeps);
      expect(result).toBeNull();
    });
    it("should make a valid claim if no claim is made", async () => {
      veaInbox.snapshots = jest.fn().mockResolvedValue("0x7890");
      mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
        challenged: false,
        stateroot: mockClaim.stateRoot,
      });
      mockDeps.transactionHandler = mockTransactionHandler;
      mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
      mockDeps.claim = null;
      mockDeps.veaInbox = veaInbox;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.claimTxn).toBe(mockTransactions.claimTxn);
    });
    it("should make a valid claim if last claim was challenged", async () => {
      veaInbox.snapshots = jest.fn().mockResolvedValue(mockClaim.stateRoot);
      mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
        challenged: true,
        stateroot: mockClaim.stateRoot,
      });
      mockDeps.transactionHandler = mockTransactionHandler;
      mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
      mockDeps.claim = null;
      mockDeps.veaInbox = veaInbox;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.claimTxn).toEqual(mockTransactions.claimTxn);
    });
    it("should withdraw claim deposit if claimer is honest", async () => {
      mockDeps.transactionHandler = mockTransactionHandler;
      mockClaim.honest = ClaimHonestState.CLAIMER;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.withdrawClaimDepositTxn).toEqual(mockTransactions.withdrawClaimDepositTxn);
    });
    it("should start verification if verification is not started", async () => {
      mockDeps.transactionHandler = mockTransactionHandler;
      mockClaim.honest = ClaimHonestState.NONE;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.startVerificationTxn).toEqual(mockTransactions.startVerificationTxn);
    });
    it("should verify snapshot if verification is started", async () => {
      mockDeps.transactionHandler = mockTransactionHandler;
      mockClaim.honest = ClaimHonestState.NONE;
      mockClaim.timestampVerification = 1234;
      mockDeps.claim = mockClaim;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.verifySnapshotTxn).toEqual(mockTransactions.verifySnapshotTxn);
    });
  });
});
