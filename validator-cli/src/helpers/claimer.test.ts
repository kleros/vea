import { ethers } from "ethers";
import { checkAndClaim, CheckAndClaimParams } from "./claimer";
import { ClaimHonestState } from "../utils/claim";
import { Network } from "../consts/bridgeRoutes";

describe("claimer", () => {
  const NETWORK = Network.DEVNET;
  let veaOutbox: any;
  let veaInbox: any;
  let veaInboxProvider: any;
  let veaOutboxProvider: any;
  let emitter: any;
  let mockClaim: any;
  let mockGetLatestClaimedEpoch: any;
  let mockGetTransactionHandler: any;
  let mockDeps: CheckAndClaimParams;

  let mockTransactionHandler: any;
  const mockTransactions = {
    claimTxn: "0x111",
    withdrawClaimDepositTxn: "0x222",
    startVerificationTxn: "0x333",
    verifySnapshotTxn: "0x444",
    devnetAdvanceStateTxn: "0x555",
  };
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
    mockGetTransactionHandler = jest.fn().mockReturnValue(function DummyTransactionHandler(params: any) {
      // Return an object that matches our expected transaction handler.
      return mockTransactionHandler;
    });
    mockDeps = {
      chainId: 0,
      claim: mockClaim,
      network: NETWORK,
      epoch: 10,
      epochPeriod: 10,
      veaInbox,
      veaInboxProvider,
      veaOutboxProvider,
      veaOutbox,
      transactionHandler: null,
      emitter,
      fetchLatestClaimedEpoch: mockGetLatestClaimedEpoch,
      fetchSettledReadBlocks: jest.fn().mockResolvedValue({ inboxBlock: 4242, outboxBlock: 555 }),
      now: 110000, // (epoch+ 1) * epochPeriod * 1000 for claimable epoch
    };

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
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe("checkAndClaim", () => {
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
        devnetAdvanceState: jest.fn().mockImplementation(() => {
          mockTransactionHandler.transactions.devnetAdvanceStateTxn = mockTransactions.devnetAdvanceStateTxn;
          return Promise.resolve();
        }),
        transactions: {
          claimTxn: "0x0",
          withdrawClaimDepositTxn: "0x0",
          startVerificationTxn: "0x0",
          verifySnapshotTxn: "0x0",
        },
      };
      mockGetTransactionHandler = jest.fn().mockReturnValue(function DummyTransactionHandler(param: any) {
        return mockTransactionHandler;
      });
      mockDeps.fetchTransactionHandler = mockGetTransactionHandler;
    });
    it("should return null if no claim is made for a passed epoch", async () => {
      mockDeps.epoch = 7; // claimable epoch - 3
      mockDeps.claim = null;

      mockDeps.fetchTransactionHandler = mockGetTransactionHandler;
      const result = await checkAndClaim(mockDeps);
      expect(result).toBeNull();
    });
    it("should return null if no snapshot is saved on the inbox for a claimable epoch", async () => {
      veaInbox.snapshots = jest.fn().mockResolvedValue(ethers.ZeroHash);
      mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
        challenged: false,
        stateRoot: "0x1111",
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
        stateRoot: "0x1111",
      });
      mockDeps.claim = null;
      mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
      const result = await checkAndClaim(mockDeps);
      expect(result).toBeNull();
    });
    describe("devnet", () => {
      beforeEach(() => {
        mockDeps.network = Network.DEVNET;
      });
      it("should make a valid claim and advance state", async () => {
        veaInbox.snapshots = jest.fn().mockResolvedValue("0x7890");
        mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
          challenged: false,
          stateRoot: mockClaim.stateRoot,
        });
        mockDeps.transactionHandler = mockTransactionHandler;
        mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
        mockDeps.claim = null;
        mockDeps.veaInbox = veaInbox;
        const result = await checkAndClaim(mockDeps);
        expect(result.transactions.devnetAdvanceStateTxn).toBe(mockTransactions.devnetAdvanceStateTxn);
      });
    });
    describe("testnet", () => {
      beforeEach(() => {
        mockDeps.network = Network.TESTNET;
      });
      it("should make a valid claim if no claim is made", async () => {
        veaInbox.snapshots = jest.fn().mockResolvedValue("0x7890");
        mockGetLatestClaimedEpoch = jest.fn().mockResolvedValue({
          challenged: false,
          stateRoot: mockClaim.stateRoot,
        });
        mockDeps.transactionHandler = mockTransactionHandler;
        mockDeps.fetchLatestClaimedEpoch = mockGetLatestClaimedEpoch;
        mockDeps.claim = null;
        mockDeps.veaInbox = veaInbox;
        const fetchBlocksAndCheckFinality = jest.fn().mockResolvedValue([0, 0, false, false]);
        mockDeps.fetchBlocksAndCheckFinality = fetchBlocksAndCheckFinality;
        const result = await checkAndClaim(mockDeps);
        expect(result.transactions.claimTxn).toBe(mockTransactions.claimTxn);
      });
      it("scans a bounded window for the most recent claim instead of the whole chain", async () => {
        const SEC_PER_BLOCK = 12;
        const HEAD_BLOCK = 1_000_000;
        const queriedRanges: Array<[number, number]> = [];
        veaOutbox.queryFilter = jest.fn(async (_filter: any, from: number, to: number) => {
          queriedRanges.push([from, to]);
          return [];
        });
        veaOutbox.filters = { Claimed: jest.fn(() => ({ event: "Claimed" })) };
        veaOutboxProvider.getBlock = jest.fn(async (tag: any) => {
          const number = typeof tag === "number" ? tag : HEAD_BLOCK;
          return { number, timestamp: number * SEC_PER_BLOCK };
        });
        veaInbox.snapshots = jest.fn().mockResolvedValue("0x7890");
        mockDeps.transactionHandler = mockTransactionHandler;
        mockDeps.fetchLatestClaimedEpoch = jest.fn().mockResolvedValue({
          challenged: false,
          stateRoot: mockClaim.stateRoot,
        });
        mockDeps.claim = null;
        mockDeps.veaInbox = veaInbox;
        mockDeps.veaOutbox = veaOutbox;
        mockDeps.veaOutboxProvider = veaOutboxProvider;
        mockDeps.fetchBlocksAndCheckFinality = jest.fn().mockResolvedValue([0, 0, false, false]);
        mockDeps.chainId = 11155111;

        await checkAndClaim(mockDeps);

        expect(queriedRanges.length).toBeGreaterThan(0);
        // ethers defaults an omitted range to fromBlock 0, which every provider
        // rejects on a chain of this size.
        expect(Math.min(...queriedRanges.map((r) => r[0]))).toBeGreaterThan(0);
        for (const [from, to] of queriedRanges) {
          expect(to - from).toBeLessThan(10_000);
          expect(to).toBeLessThanOrEqual(HEAD_BLOCK);
        }
      });

      it("pins the claim decision reads to settled blocks", async () => {
        veaInbox.snapshots = jest.fn().mockResolvedValue("0x7890");
        veaOutbox.stateRoot = jest.fn().mockResolvedValue("0xstateroot");
        veaOutbox.queryFilter = jest.fn(async () => []);
        veaOutbox.filters = { Claimed: jest.fn(() => ({})) };
        mockDeps.transactionHandler = mockTransactionHandler;
        mockDeps.claim = null;
        mockDeps.veaInbox = veaInbox;
        mockDeps.veaOutbox = veaOutbox;
        mockDeps.chainId = 11155111;
        mockDeps.fetchLatestClaimedEpoch = jest.fn().mockResolvedValue({ stateRoot: "0xold" });
        mockDeps.fetchSettledReadBlocks = jest.fn().mockResolvedValue({ inboxBlock: 4242, outboxBlock: 555 });

        await checkAndClaim(mockDeps);

        // A claim stakes a deposit on these values, so both must come from a
        // block that can no longer be reorged.
        expect(veaInbox.snapshots).toHaveBeenCalledWith(mockDeps.epoch, { blockTag: 4242 });
        expect(veaOutbox.stateRoot).toHaveBeenCalledWith({ blockTag: 555 });
      });

      it("does not claim while the epoch is not yet settled", async () => {
        veaInbox.snapshots = jest.fn().mockResolvedValue("0x7890");
        mockDeps.transactionHandler = mockTransactionHandler;
        mockDeps.claim = null;
        mockDeps.veaInbox = veaInbox;
        mockDeps.fetchSettledReadBlocks = jest.fn().mockResolvedValue(null);

        const result = await checkAndClaim(mockDeps);

        expect(result).toBeNull();
        expect(mockTransactionHandler.makeClaim).not.toHaveBeenCalled();
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
});
