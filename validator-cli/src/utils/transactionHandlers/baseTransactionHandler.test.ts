import {
  BaseTransactionHandler,
  BaseTransactionHandlerConstructor,
  ContractType,
  TransactionStatus,
  MAX_PENDING_CONFIRMATIONS,
  Transaction,
} from "./baseTransactionHandler";
import { BotEvents } from "../botEvents";
import { ClaimNotSetError } from "../errors";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { ClaimStruct } from "../../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { MockEmitter } from "../emitter";

// Concrete subclass to enable testing of BaseTransactionHandler
class DummyHandler extends BaseTransactionHandler<any, any> {
  public async makeClaim(_stateRoot: string): Promise<void> {
    return;
  }
  public async challengeClaim(): Promise<void> {
    return;
  }
  public async sendSnapshot(): Promise<void> {
    return;
  }
  public async resolveChallengedClaim(_sendSnapshotTxnHash: string): Promise<void> {
    return;
  }
}

describe("BaseTransactionHandler", () => {
  let veaInboxProvider: any;
  let veaOutboxProvider: any;
  let veaInbox: any;
  let veaOutbox: any;
  let transactionHandler: BaseTransactionHandler<any, any>;
  let transactionHandlerParams: BaseTransactionHandlerConstructor;
  const chainId = 11155111; // Using Sepolia for bridge config
  const epoch = 42;
  const network = Network.TESTNET;
  const claim: ClaimStruct = {
    stateRoot: "0xdead",
    claimer: "0xabc",
    timestampClaimed: 1000,
    timestampVerification: 2000,
    blocknumberVerification: 0,
    honest: 1,
    challenger: "0xdef",
  };
  const mockEmitter = new MockEmitter();

  beforeEach(() => {
    veaOutbox = {
      withdrawChallengeDeposit: jest.fn(),
      ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"]: jest.fn(),
      claim: jest.fn(),
      startVerification: jest.fn(),
      verifySnapshot: jest.fn(),
      withdrawClaimDeposit: jest.fn(),
    };
    veaInbox = {
      sendSnapshot: jest.fn(),
      saveSnapshot: jest.fn(),
    };

    // Providers
    veaInboxProvider = { getTransactionReceipt: jest.fn(), getBlock: jest.fn() };
    veaOutboxProvider = { getTransactionReceipt: jest.fn(), getBlock: jest.fn() };

    // veaInbox & veaOutbox mocks
    veaInbox = {
      saveSnapshot: jest.fn().mockResolvedValue({ hash: "0x1" }),
    };
    veaOutbox = {
      startVerification: jest.fn().mockResolvedValue({ hash: "0xa" }),
      verifySnapshot: jest.fn().mockResolvedValue({ hash: "0xb" }),
      withdrawClaimDeposit: jest.fn().mockResolvedValue({ hash: "0xc" }),
      withdrawChallengeDeposit: jest.fn().mockResolvedValue({ hash: "0xd" }),
    };

    transactionHandlerParams = {
      chainId,
      network: Network.TESTNET,
      epoch,
      veaInbox,
      veaOutbox,
      veaInboxProvider,
      veaOutboxProvider,
      emitter: mockEmitter,
      claim: null,
    };
    transactionHandler = new DummyHandler({ ...transactionHandlerParams });
  });

  describe("checkTransactionStatus", () => {
    let finalityBlock: number = 100;
    let mockBroadcastedTimestamp: number = 1000;
    beforeEach(() => {
      veaInboxProvider.getBlock.mockResolvedValue({ number: finalityBlock });
    });

    it("should return 2 if transaction is not final", async () => {
      jest.spyOn(mockEmitter, "emit");
      veaInboxProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: finalityBlock - (MAX_PENDING_CONFIRMATIONS - 1),
      });
      const trnx: Transaction = { hash: "0x123456", broadcastedTimestamp: mockBroadcastedTimestamp };
      const status = await transactionHandler.checkTransactionStatus(
        trnx,
        ContractType.INBOX,
        mockBroadcastedTimestamp + 1
      );
      expect(status).toEqual(2);
      expect(mockEmitter.emit).toHaveBeenCalledWith(BotEvents.TXN_NOT_FINAL, trnx.hash, 1);
    });

    it("should return 1 if transaction is pending", async () => {
      jest.spyOn(mockEmitter, "emit");
      veaInboxProvider.getTransactionReceipt.mockResolvedValue(null);
      const trnx: Transaction = { hash: "0x123456", broadcastedTimestamp: mockBroadcastedTimestamp };
      const status = await transactionHandler.checkTransactionStatus(
        trnx,
        ContractType.INBOX,
        mockBroadcastedTimestamp + 1
      );
      expect(status).toEqual(1);
      expect(mockEmitter.emit).toHaveBeenCalledWith(BotEvents.TXN_PENDING, trnx.hash);
    });

    it("should return 3 if transaction is final", async () => {
      jest.spyOn(mockEmitter, "emit");
      veaInboxProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: finalityBlock - MAX_PENDING_CONFIRMATIONS,
      });
      const trnx: Transaction = { hash: "0x123456", broadcastedTimestamp: mockBroadcastedTimestamp };

      const status = await transactionHandler.checkTransactionStatus(
        trnx,
        ContractType.INBOX,
        mockBroadcastedTimestamp + 1
      );
      expect(status).toEqual(3);
      expect(mockEmitter.emit).toHaveBeenCalledWith(BotEvents.TXN_FINAL, trnx.hash, MAX_PENDING_CONFIRMATIONS);
    });

    it("should return 0 if transaction hash is null", async () => {
      const trnx = null;
      const status = await transactionHandler.checkTransactionStatus(
        trnx,
        ContractType.INBOX,
        mockBroadcastedTimestamp
      );
      expect(status).toEqual(0);
    });
  });

  describe("saveSnapshot()", () => {
    it("saves snapshot when none pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.NOT_MADE);
      await transactionHandler.saveSnapshot();
      expect(veaInbox.saveSnapshot).toHaveBeenCalled();
      expect(transactionHandler.transactions.saveSnapshotTxn).toEqual(expect.objectContaining({ hash: "0x1" }));
    });

    it("does nothing when snapshot pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.PENDING);
      transactionHandler.transactions.saveSnapshotTxn = { hash: "0x1", broadcastedTimestamp: Date.now() };
      await transactionHandler.saveSnapshot();
      expect(veaInbox.saveSnapshot).not.toHaveBeenCalled();
    });
  });

  describe("startVerification()", () => {
    const cfg = getBridgeConfig(chainId);
    const flipTime = Number(claim.timestampClaimed) + cfg.sequencerDelayLimit + cfg.routeConfig[network].epochPeriod;
    it("throws if claim not set", async () => {
      transactionHandler = new DummyHandler({ ...transactionHandlerParams });
      await expect(transactionHandler.startVerification(flipTime)).rejects.toThrow(ClaimNotSetError);
    });

    it("should not start verification if timeout has not passed", async () => {
      transactionHandler = new DummyHandler({ ...transactionHandlerParams, claim: claim });
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.NOT_MADE);
      await transactionHandler.startVerification(flipTime - 1);
      expect(veaOutbox.startVerification).not.toHaveBeenCalled();
    });

    it("starts verification when ready", async () => {
      transactionHandler = new DummyHandler({ ...transactionHandlerParams, claim: claim });

      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.NOT_MADE);
      await transactionHandler.startVerification(flipTime);
      expect(veaOutbox.startVerification).toHaveBeenCalledWith(epoch, claim);
      expect(transactionHandler.transactions.startVerificationTxn).toHaveProperty("hash", "0xa");
    });
    it("should not start verification if a startVerification transaction is pending", async () => {
      transactionHandler = new DummyHandler({ ...transactionHandlerParams, claim: claim });
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);

      await transactionHandler.startVerification(flipTime);

      expect(veaOutbox.startVerification).not.toHaveBeenCalled();
      expect(transactionHandler.transactions.startVerificationTxn).toBeNull();
    });
  });

  describe("verifySnapshot()", () => {
    const cfg = getBridgeConfig(chainId);
    const flipTime = Number(claim.timestampVerification) + cfg.minChallengePeriod;

    it("throws if claim not set", async () => {
      const h = new DummyHandler({ ...transactionHandlerParams, claim: null });
      await expect(h.verifySnapshot(flipTime)).rejects.toThrow(ClaimNotSetError);
    });

    it("does nothing when status is pending", async () => {
      transactionHandler = new DummyHandler({ ...transactionHandlerParams, claim: claim });
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.PENDING);
      await transactionHandler.verifySnapshot(flipTime);
      expect(veaOutbox.verifySnapshot).not.toHaveBeenCalled();
    });

    it("should not verify snapshot", async () => {
      transactionHandler = new DummyHandler({ ...transactionHandlerParams, claim: claim });
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.NOT_MADE);
      await transactionHandler.verifySnapshot(flipTime - 1);
      expect(veaOutbox.verifySnapshot).not.toHaveBeenCalled();
    });

    it("verifies snapshot when ready", async () => {
      transactionHandler = new DummyHandler({ ...transactionHandlerParams, claim: claim });
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.NOT_MADE);
      await transactionHandler.verifySnapshot(flipTime);
      expect(veaOutbox.verifySnapshot).toHaveBeenCalledWith(epoch, claim);
      expect(transactionHandler.transactions.verifySnapshotTxn).toHaveProperty("hash", "0xb");
    });
  });

  describe("withdrawClaimDeposit()", () => {
    it("throws if claim not set", async () => {
      await expect(transactionHandler.withdrawClaimDeposit()).rejects.toThrow(ClaimNotSetError);
    });

    it("withdraws when none pending", async () => {
      transactionHandler = new DummyHandler({ ...transactionHandlerParams, claim: claim });
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.NOT_MADE);
      await transactionHandler.withdrawClaimDeposit();
      expect(veaOutbox.withdrawClaimDeposit).toHaveBeenCalledWith(epoch, claim);
      expect(transactionHandler.transactions.withdrawClaimDepositTxn).toHaveProperty("hash", "0xc");
    });
  });

  describe("withdrawChallengeDeposit()", () => {
    it("throws if claim not set", async () => {
      const h = new DummyHandler({ ...transactionHandlerParams, claim: null });
      await expect(h.withdrawChallengeDeposit()).rejects.toThrow(ClaimNotSetError);
    });

    it("withdraws when none pending", async () => {
      transactionHandler = new DummyHandler({ ...transactionHandlerParams, claim: claim });
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.NOT_MADE);
      await transactionHandler.withdrawChallengeDeposit();
      expect(veaOutbox.withdrawChallengeDeposit).toHaveBeenCalledWith(epoch, claim);
      expect(transactionHandler.transactions.withdrawChallengeDepositTxn).toHaveProperty("hash", "0xd");
    });
  });
});
