import { ethers } from "ethers";
import { checkAndClaim } from "./claimer";
import { ArbToEthTransactionHandler } from "./transactionHandler";
import { ClaimHonestState } from "../utils/claim";
import { start } from "pm2";
describe("claimer", () => {
  let veaOutbox: any;
  let veaInbox: any;
  let veaInboxProvider: any;
  let veaOutboxProvider: any;
  let emitter: any;
  let mockGetClaim: any;
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
      getBlock: jest.fn().mockResolvedValue({ number: 0, timestamp: 100 }),
    };
    emitter = {
      emit: jest.fn(),
    };

    mockGetClaim = jest.fn();
    mockGetLatestClaimedEpoch = jest.fn();
    mockDeps = {
      epoch: 10,
      epochPeriod: 10,
      veaInbox,
      veaInboxProvider,
      veaOutboxProvider,
      veaOutbox,
      transactionHandler: null,
      emitter,
      fetchClaim: mockGetClaim,
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
      mockGetClaim = jest.fn().mockReturnValue(null);
      mockDeps.epoch = 7; // claimable epoch - 3
      mockDeps.fetchClaim = mockGetClaim;
      const result = await checkAndClaim(mockDeps);
      expect(result).toBeNull();
    });
    it("should return null if no snapshot is saved on the inbox for a claimable epoch", async () => {
      mockGetClaim = jest.fn().mockReturnValue(null);
      veaInbox.snapshots = jest.fn().mockResolvedValue(ethers.ZeroHash);
      mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
        challenged: false,
        stateroot: "0x1111",
      });
      mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
      const result = await checkAndClaim(mockDeps);
      expect(result).toBeNull();
    });
    it("should return null if there are no new messages in the inbox", async () => {
      mockGetClaim = jest.fn().mockReturnValue(null);
      veaInbox.snapshots = jest.fn().mockResolvedValue(mockClaim.stateRoot);
      mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
        challenged: false,
        stateroot: "0x1111",
      });
      mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
      const result = await checkAndClaim(mockDeps);
      expect(result).toBeNull();
    });
    it("should make a valid calim if no claim is made", async () => {
      mockGetClaim = jest.fn().mockReturnValue(null);
      veaInbox.snapshots = jest.fn().mockResolvedValue("0x7890");
      mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
        challenged: false,
        stateroot: mockClaim.stateRoot,
      });
      mockDeps.transactionHandler = mockTransactionHandler;
      mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
      mockDeps.fetchClaim = mockGetClaim;
      mockDeps.veaInbox = veaInbox;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.claimTxn).toBe(mockTransactions.claimTxn);
    });
    it("should make a valid calim if last claim was challenged", async () => {
      mockGetClaim = jest.fn().mockReturnValue(null);
      veaInbox.snapshots = jest.fn().mockResolvedValue(mockClaim.stateRoot);
      mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
        challenged: true,
        stateroot: mockClaim.stateRoot,
      });
      mockDeps.transactionHandler = mockTransactionHandler;
      mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
      mockDeps.fetchClaim = mockGetClaim;
      mockDeps.veaInbox = veaInbox;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.claimTxn).toEqual(mockTransactions.claimTxn);
    });
    it("should withdraw claim deposit if claimer is honest", async () => {
      mockDeps.transactionHandler = mockTransactionHandler;
      mockClaim.honest = ClaimHonestState.CLAIMER;

      mockGetClaim = jest.fn().mockResolvedValue(mockClaim);
      mockDeps.fetchClaim = mockGetClaim;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.withdrawClaimDepositTxn).toEqual(mockTransactions.withdrawClaimDepositTxn);
    });
    it("should start verification if verification is not started", async () => {
      mockDeps.transactionHandler = mockTransactionHandler;
      mockClaim.honest = ClaimHonestState.NONE;
      mockGetClaim = jest.fn().mockResolvedValue(mockClaim);
      mockDeps.fetchClaim = mockGetClaim;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.startVerificationTxn).toEqual(mockTransactions.startVerificationTxn);
    });
    it("should verify snapshot if verification is started", async () => {
      mockDeps.transactionHandler = mockTransactionHandler;
      mockClaim.honest = ClaimHonestState.NONE;
      mockClaim.timestampVerification = 1234;
      mockGetClaim = jest.fn().mockResolvedValue(mockClaim);
      mockDeps.fetchClaim = mockGetClaim;
      const result = await checkAndClaim(mockDeps);
      expect(result.transactions.verifySnapshotTxn).toEqual(mockTransactions.verifySnapshotTxn);
    });
  });
});
