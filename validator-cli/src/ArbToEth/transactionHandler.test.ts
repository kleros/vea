import { ArbToEthTransactionHandler, ContractType } from "./transactionHandler";
import { MockEmitter, defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
import { ClaimNotSetError } from "../utils/errors";
import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";

describe("ArbToEthTransactionHandler", () => {
  let epoch: number = 100;
  let veaInbox: any;
  let veaOutbox: any;
  let veaInboxProvider: any;
  let veaOutboxProvider: any;
  let claim: ClaimStruct = null;

  beforeEach(() => {
    veaInboxProvider = {
      getTransactionReceipt: jest.fn(),
      getBlock: jest.fn(),
    };
    veaOutbox = {
      estimateGas: jest.fn(),
      withdrawChallengeDeposit: jest.fn(),
      ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"]: jest.fn(),
    };
    veaInbox = {
      sendSnapshot: jest.fn(),
    };
    claim = {
      stateRoot: "0x1234",
      claimer: "0x1234",
      timestampClaimed: 1234,
      timestampVerification: 0,
      blocknumberVerification: 0,
      honest: 0,
      challenger: "0x1234",
    };
  });

  describe("constructor", () => {
    it("should create a new TransactionHandler without claim", () => {
      const transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider
      );
      expect(transactionHandler).toBeDefined();
      expect(transactionHandler.epoch).toEqual(epoch);
      expect(transactionHandler.veaOutbox).toEqual(veaOutbox);
      expect(transactionHandler.emitter).toEqual(defaultEmitter);
    });

    it("should create a new TransactionHandler with claim", () => {
      const transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        defaultEmitter,
        claim
      );
      expect(transactionHandler).toBeDefined();
      expect(transactionHandler.epoch).toEqual(epoch);
      expect(transactionHandler.veaOutbox).toEqual(veaOutbox);
      expect(transactionHandler.claim).toEqual(claim);
      expect(transactionHandler.emitter).toEqual(defaultEmitter);
    });
  });

  describe("checkTransactionStatus", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    let finalityBlock: number = 100;
    const mockEmitter = new MockEmitter();
    beforeEach(() => {
      transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        mockEmitter
      );
      veaInboxProvider.getBlock.mockResolvedValue({ number: finalityBlock });
    });

    it("should return 2 if transaction is not final", async () => {
      jest.spyOn(mockEmitter, "emit");
      veaInboxProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: finalityBlock - (transactionHandler.requiredConfirmations - 1),
      });
      const trnxHash = "0x123456";
      const status = await transactionHandler.checkTransactionStatus(trnxHash, ContractType.INBOX);
      expect(status).toEqual(2);
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        BotEvents.TXN_NOT_FINAL,
        trnxHash,
        transactionHandler.requiredConfirmations - 1
      );
    });

    it("should return 1 if transaction is pending", async () => {
      jest.spyOn(mockEmitter, "emit");
      veaInboxProvider.getTransactionReceipt.mockResolvedValue(null);
      const trnxHash = "0x123456";
      const status = await transactionHandler.checkTransactionStatus(trnxHash, ContractType.INBOX);
      expect(status).toEqual(1);
      expect(mockEmitter.emit).toHaveBeenCalledWith(BotEvents.TXN_PENDING, trnxHash);
    });

    it("should return 3 if transaction is final", async () => {
      jest.spyOn(mockEmitter, "emit");
      veaInboxProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: finalityBlock - transactionHandler.requiredConfirmations,
      });
      const trnxHash = "0x123456";
      const status = await transactionHandler.checkTransactionStatus(trnxHash, ContractType.INBOX);
      expect(status).toEqual(3);
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        BotEvents.TXN_FINAL,
        trnxHash,
        transactionHandler.requiredConfirmations
      );
    });

    it("should return 0 if transaction hash is null", async () => {
      const trnxHash = null;
      const status = await transactionHandler.checkTransactionStatus(trnxHash, ContractType.INBOX);
      expect(status).toEqual(0);
    });
  });

  describe("challengeClaim", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    const mockEmitter = new MockEmitter();
    beforeEach(() => {
      transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        mockEmitter
      );
      transactionHandler.claim = claim;
    });

    it("should emit CHALLENGING event and throw error if claim is not set", async () => {
      jest.spyOn(mockEmitter, "emit");
      transactionHandler.claim = null;
      await expect(transactionHandler.challengeClaim()).rejects.toThrow(ClaimNotSetError);
      expect(mockEmitter.emit).toHaveBeenCalledWith(BotEvents.CHALLENGING);
    });

    it("should not challenge claim if txn is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      transactionHandler.transactions.challengeTxn = "0x1234";
      await transactionHandler.challengeClaim();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        transactionHandler.transactions.challengeTxn,
        ContractType.OUTBOX
      );
      expect(veaOutbox.estimateGas).not.toHaveBeenCalled();
    });

    it("should challenge claim", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      const mockChallenge = jest.fn().mockResolvedValue({ hash: "0x1234" }) as any;
      (mockChallenge as any).estimateGas = jest.fn().mockResolvedValue(BigInt(100000));
      veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"] = mockChallenge;
      await transactionHandler.challengeClaim();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(null, ContractType.OUTBOX);
      expect(transactionHandler.transactions.challengeTxn).toEqual("0x1234");
    });

    it.todo("should set challengeTxn as completed when txn is final");
  });

  describe("withdrawDeposit", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    const mockEmitter = new MockEmitter();
    beforeEach(() => {
      transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        mockEmitter
      );
      veaOutbox.withdrawChallengeDeposit.mockResolvedValue("0x1234");
      transactionHandler.claim = claim;
    });

    it("should withdraw deposit", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      veaOutbox.withdrawChallengeDeposit.mockResolvedValue({ hash: "0x1234" });
      await transactionHandler.withdrawChallengeDeposit();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(null, ContractType.OUTBOX);
      expect(transactionHandler.transactions.withdrawChallengeDepositTxn).toEqual("0x1234");
    });

    it("should not withdraw deposit if txn is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      transactionHandler.transactions.withdrawChallengeDepositTxn = "0x1234";
      await transactionHandler.withdrawChallengeDeposit();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        transactionHandler.transactions.withdrawChallengeDepositTxn,
        ContractType.OUTBOX
      );
    });

    it("should throw an error if claim is not set", async () => {
      transactionHandler.claim = null;
      await expect(transactionHandler.withdrawChallengeDeposit()).rejects.toThrow(ClaimNotSetError);
    });

    it("should emit WITHDRAWING event", async () => {
      jest.spyOn(mockEmitter, "emit");
      await transactionHandler.withdrawChallengeDeposit();
      expect(mockEmitter.emit).toHaveBeenCalledWith(BotEvents.WITHDRAWING);
    });
  });

  describe("sendSnapshot", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    const mockEmitter = new MockEmitter();
    beforeEach(() => {
      transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        mockEmitter
      );
      transactionHandler.claim = claim;
    });

    it("should send snapshot", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      veaInbox.sendSnapshot.mockResolvedValue({ hash: "0x1234" });
      await transactionHandler.sendSnapshot();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(null, ContractType.INBOX);
      expect(transactionHandler.transactions.sendSnapshotTxn).toEqual("0x1234");
    });

    it("should not send snapshot if txn is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      transactionHandler.transactions.sendSnapshotTxn = "0x1234";
      await transactionHandler.sendSnapshot();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        transactionHandler.transactions.sendSnapshotTxn,
        ContractType.INBOX
      );
      expect(veaInbox.sendSnapshot).not.toHaveBeenCalled();
    });

    it("should throw an error if claim is not set", async () => {
      jest.spyOn(mockEmitter, "emit");
      transactionHandler.claim = null;
      await expect(transactionHandler.sendSnapshot()).rejects.toThrow(ClaimNotSetError);
      expect(mockEmitter.emit).toHaveBeenCalledWith(BotEvents.SENDING_SNAPSHOT, epoch);
    });
  });

  describe("resolveChallengedClaim", () => {
    let mockMessageExecutor: any;
    let transactionHandler: ArbToEthTransactionHandler;
    const mockEmitter = new MockEmitter();
    beforeEach(() => {
      mockMessageExecutor = jest.fn();
      transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        mockEmitter
      );
    });
    it("should resolve challenged claim", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      transactionHandler.transactions.sendSnapshotTxn = "0x1234";
      mockMessageExecutor.mockResolvedValue({ hash: "0x1234" });
      await transactionHandler.resolveChallengedClaim(
        transactionHandler.transactions.sendSnapshotTxn,
        mockMessageExecutor
      );
      expect(transactionHandler.transactions.executeSnapshotTxn).toEqual("0x1234");
    });

    it("should not resolve challenged claim if txn is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      transactionHandler.transactions.executeSnapshotTxn = "0x1234";
      await transactionHandler.resolveChallengedClaim(mockMessageExecutor);
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        transactionHandler.transactions.executeSnapshotTxn,
        ContractType.OUTBOX
      );
    });
  });
});
