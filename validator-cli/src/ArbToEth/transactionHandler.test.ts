import { ArbToEthTransactionHandler, ContractType } from "./transactionHandler";
import { MockEmitter, defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
import { ClaimNotSetError } from "../utils/errors";
import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { getBridgeConfig } from "../consts/bridgeRoutes";

describe("ArbToEthTransactionHandler", () => {
  const chainId = 11155111;
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
      estimateGas: {
        claim: jest.fn(),
      },
      withdrawChallengeDeposit: jest.fn(),
      ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"]: jest.fn(),
      claim: jest.fn(),
      startVerification: jest.fn(),
      verifySnapshot: jest.fn(),
      withdrawClaimDeposit: jest.fn(),
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

  // Happy path (claimer)
  describe("makeClaim", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    const mockEmitter = new MockEmitter();
    const { deposit } = getBridgeConfig(chainId);
    beforeEach(() => {
      const mockClaim = jest.fn().mockResolvedValue({ hash: "0x1234" }) as any;
      (mockClaim as any).estimateGas = jest.fn().mockResolvedValue(BigInt(100000));
      veaOutbox["claim(uint256,bytes32)"] = mockClaim;
      transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        mockEmitter
      );
      veaOutbox.claim.mockResolvedValue({ hash: "0x1234" });
    });

    it("should make a claim and set pending claim trnx", async () => {
      // Mock checkTransactionPendingStatus to always return false
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);

      await transactionHandler.makeClaim(claim.stateRoot as string);

      expect(veaOutbox.claim).toHaveBeenCalledWith(epoch, claim.stateRoot, {
        gasLimit: BigInt(100000),
        value: deposit,
      });
      expect(transactionHandler.transactions.claimTxn).toEqual("0x1234");
    });

    it("should not make a claim if a claim transaction is pending", async () => {
      // Mock checkTransactionPendingStatus to always return true
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      await transactionHandler.makeClaim(claim.stateRoot as string);
      expect(veaOutbox.claim).not.toHaveBeenCalled();
      expect(transactionHandler.transactions.claimTxn).toBeNull();
    });
  });

  describe("startVerification", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    const mockEmitter = new MockEmitter();
    const { epochPeriod, sequencerDelayLimit } = getBridgeConfig(chainId);
    let startVerificationFlipTime: number;
    const mockStartVerification = jest.fn().mockResolvedValue({ hash: "0x1234" }) as any;
    (mockStartVerification as any).estimateGas = jest.fn().mockResolvedValue(BigInt(100000));
    beforeEach(() => {
      veaOutbox["startVerification(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"] =
        mockStartVerification;
      veaOutbox.startVerification.mockResolvedValue({ hash: "0x1234" });
      startVerificationFlipTime = Number(claim.timestampClaimed) + epochPeriod + sequencerDelayLimit;
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

    it("should start verification and set pending startVerificationTxm", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);

      await transactionHandler.startVerification(startVerificationFlipTime);

      expect(
        veaOutbox["startVerification(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"].estimateGas
      ).toHaveBeenCalledWith(epoch, claim);
      expect(veaOutbox.startVerification).toHaveBeenCalledWith(epoch, claim, { gasLimit: BigInt(100000) });
      expect(transactionHandler.transactions.startVerificationTxn).toEqual("0x1234");
    });

    it("should not start verification if a startVerification transaction is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);

      await transactionHandler.startVerification(startVerificationFlipTime);

      expect(veaOutbox.startVerification).not.toHaveBeenCalled();
      expect(transactionHandler.transactions.startVerificationTxn).toBeNull();
    });

    it("should throw an error if claim is not set", async () => {
      transactionHandler.claim = null;
      await expect(transactionHandler.startVerification(startVerificationFlipTime)).rejects.toThrow(ClaimNotSetError);
    });

    it("should not start verification if timeout has not passed", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      await transactionHandler.startVerification(startVerificationFlipTime - 1);
      expect(veaOutbox.startVerification).not.toHaveBeenCalled();
      expect(transactionHandler.transactions.startVerificationTxn).toBeNull();
    });
  });

  describe("verifySnapshot", () => {
    let verificationFlipTime: number;
    let transactionHandler: ArbToEthTransactionHandler;
    const mockEmitter = new MockEmitter();
    beforeEach(() => {
      const mockVerifySnapshot = jest.fn().mockResolvedValue({ hash: "0x1234" }) as any;
      (mockVerifySnapshot as any).estimateGas = jest.fn().mockResolvedValue(BigInt(100000));
      veaOutbox["verifySnapshot(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"] = mockVerifySnapshot;
      veaOutbox.verifySnapshot.mockResolvedValue({ hash: "0x1234" });
      transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        mockEmitter
      );
      verificationFlipTime = Number(claim.timestampClaimed) + getBridgeConfig(chainId).minChallengePeriod;
      transactionHandler.claim = claim;
    });

    it("should verify snapshot and set pending verifySnapshotTxn", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);

      await transactionHandler.verifySnapshot(verificationFlipTime);

      expect(
        veaOutbox["verifySnapshot(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"].estimateGas
      ).toHaveBeenCalledWith(epoch, claim);
      expect(veaOutbox.verifySnapshot).toHaveBeenCalledWith(epoch, claim, { gasLimit: BigInt(100000) });
      expect(transactionHandler.transactions.verifySnapshotTxn).toEqual("0x1234");
    });

    it("should not verify snapshot if a verifySnapshot transaction is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);

      await transactionHandler.verifySnapshot(verificationFlipTime);

      expect(veaOutbox.verifySnapshot).not.toHaveBeenCalled();
      expect(transactionHandler.transactions.verifySnapshotTxn).toBeNull();
    });

    it("should throw an error if claim is not set", async () => {
      transactionHandler.claim = null;
      await expect(transactionHandler.verifySnapshot(verificationFlipTime)).rejects.toThrow(ClaimNotSetError);
    });

    it("should not verify snapshot if timeout has not passed", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      await transactionHandler.verifySnapshot(verificationFlipTime - 1);
      expect(veaOutbox.verifySnapshot).not.toHaveBeenCalled();
      expect(transactionHandler.transactions.verifySnapshotTxn).toBeNull();
    });
  });

  describe("withdrawClaimDeposit", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    const mockEmitter = new MockEmitter();
    beforeEach(() => {
      const mockWithdrawClaimDeposit = jest.fn().mockResolvedValue({ hash: "0x1234" }) as any;
      (mockWithdrawClaimDeposit as any).estimateGas = jest.fn().mockResolvedValue(BigInt(100000));
      veaOutbox["withdrawClaimDeposit(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"] =
        mockWithdrawClaimDeposit;
      transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        mockEmitter
      );
      veaOutbox.withdrawClaimDeposit.mockResolvedValue("0x1234");
      transactionHandler.claim = claim;
    });

    it("should withdraw deposit", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      veaOutbox.withdrawClaimDeposit.mockResolvedValue({ hash: "0x1234" });
      await transactionHandler.withdrawClaimDeposit();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(null, ContractType.OUTBOX);
      expect(transactionHandler.transactions.withdrawClaimDepositTxn).toEqual("0x1234");
    });

    it("should not withdraw deposit if txn is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      transactionHandler.transactions.withdrawClaimDepositTxn = "0x1234";
      await transactionHandler.withdrawClaimDeposit();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        transactionHandler.transactions.withdrawClaimDepositTxn,
        ContractType.OUTBOX
      );
    });

    it("should throw an error if claim is not set", async () => {
      transactionHandler.claim = null;
      await expect(transactionHandler.withdrawClaimDeposit()).rejects.toThrow(ClaimNotSetError);
    });
  });

  // Unhappy path (challenger)
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
      expect(
        veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"]
      ).not.toHaveBeenCalled();
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

  describe("withdrawChallengeDeposit", () => {
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
      expect(mockEmitter.emit).toHaveBeenCalledWith(BotEvents.WITHDRAWING_CHALLENGE_DEPOSIT);
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
