import { TransactionHandler } from "./transactionHandler";
import { ClaimNotSetError } from "./errors";
import { BotEvents } from "./botEvents";

describe("TransactionHandler Tests", () => {
  let chainId: number;
  let epoch: number;
  let claim: any;
  let veaOutbox: any;
  let mockGetBridgeConfig: any;
  beforeEach(() => {
    chainId = 1;
    epoch = 10;
    claim = {
      stateRoot: "0x1234",
      claimer: "0x1234",
      timestampClaimed: 1234,
      timestampVerification: 0,
      blocknumberVerification: 0,
      honest: 0,
      challenger: "0x1234",
    };
    veaOutbox = {
      estimateGas: {
        claim: jest.fn(),
        verifySnapshot: jest.fn(),
        startVerification: jest.fn(),
        withdrawClaimDeposit: jest.fn(),
      },
      claim: jest.fn(),
      verifySnapshot: jest.fn(),
      startVerification: jest.fn(),
      withdrawClaimDeposit: jest.fn(),
      provider: {
        getTransactionReceipt: jest.fn(),
        getBlock: jest.fn(),
      },
    };
    mockGetBridgeConfig = jest
      .fn()
      .mockReturnValue({ deposit: 1000, minChallengePeriod: 1000, sequencerDelayLimit: 1000, epochPeriod: 1000 });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create a new TransactionHandler without claim", () => {
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox);
      expect(transactionHandler).toBeDefined();
      expect(transactionHandler.epoch).toEqual(epoch);
      expect(transactionHandler.veaOutbox).toEqual(veaOutbox);
      expect(transactionHandler.chainId).toEqual(chainId);
    });

    it("should create a new TransactionHandler with claim", () => {
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, claim);
      expect(transactionHandler).toBeDefined();
      expect(transactionHandler.epoch).toEqual(epoch);
      expect(transactionHandler.veaOutbox).toEqual(veaOutbox);
      expect(transactionHandler.chainId).toEqual(chainId);
      expect(transactionHandler.claim).toEqual(claim);
    });
  });

  describe("checkTransactionPendingStatus", () => {
    const blockNumber = 10;
    const trnxHash = "0x1234";
    let transactionHandler: TransactionHandler;
    beforeEach(() => {
      transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox);
      veaOutbox.provider = {
        getTransactionReceipt: jest.fn().mockResolvedValue({ blockNumber }),
        getBlock: jest.fn(),
      };
    });
    it("should return true if transaction is not final", async () => {
      veaOutbox.provider.getBlock.mockReturnValue({
        number: blockNumber + transactionHandler.requiredConfirmations - 1,
      });
      const emitSpy = jest.spyOn(transactionHandler.emitter, "emit");
      const result = await transactionHandler.checkTransactionPendingStatus(trnxHash);
      expect(result).toBeTruthy();
      expect(emitSpy).toHaveBeenCalledWith(
        BotEvents.TXN_NOT_FINAL,
        trnxHash,
        transactionHandler.requiredConfirmations - 1
      );
    });

    it("should return false if transaction is confirmed", async () => {
      veaOutbox.provider.getBlock.mockReturnValue({
        number: blockNumber + transactionHandler.requiredConfirmations,
      });
      const emitSpy = jest.spyOn(transactionHandler.emitter, "emit");
      const result = await transactionHandler.checkTransactionPendingStatus(trnxHash);
      expect(result).toBeFalsy();
      expect(emitSpy).toHaveBeenCalledWith(BotEvents.TXN_FINAL, trnxHash, transactionHandler.requiredConfirmations);
    });

    it("should return true if transaction receipt is not found", async () => {
      veaOutbox.provider.getTransactionReceipt.mockResolvedValue(null);
      const emitSpy = jest.spyOn(transactionHandler.emitter, "emit");
      const result = await transactionHandler.checkTransactionPendingStatus(trnxHash);
      expect(result).toBeTruthy();
      expect(emitSpy).toHaveBeenCalledWith(BotEvents.TXN_PENDING, trnxHash);
    });

    it("should return false if transaction is null", async () => {
      const emitSpy = jest.spyOn(transactionHandler.emitter, "emit");
      const result = await transactionHandler.checkTransactionPendingStatus(null);
      expect(result).toBeFalsy();
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe("makeClaim", () => {
    beforeEach(() => {
      veaOutbox.estimateGas.claim.mockResolvedValue(1000);
      veaOutbox.claim.mockResolvedValue({ hash: "0x1234" });
    });

    it("should make a claim and set pending claim trnx", async () => {
      // Mock checkTransactionPendingStatus to always return false
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(false);

      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, null, mockGetBridgeConfig);
      await transactionHandler.makeClaim(claim.stateRoot);

      expect(veaOutbox.estimateGas.claim).toHaveBeenCalledWith(epoch, claim.stateRoot, { value: 1000 });
      expect(veaOutbox.claim).toHaveBeenCalledWith(epoch, claim.stateRoot, { value: 1000, gasLimit: 1000 });
      expect(transactionHandler.pendingTransactions.claim).toEqual("0x1234");
    });

    it("should not make a claim if a claim transaction is pending", async () => {
      // Mock checkTransactionPendingStatus to always return true
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(true);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, mockGetBridgeConfig);
      await transactionHandler.makeClaim(claim.stateRoot);

      expect(veaOutbox.estimateGas.claim).not.toHaveBeenCalled();
      expect(veaOutbox.claim).not.toHaveBeenCalled();
      expect(transactionHandler.pendingTransactions.claim).toBeNull();
    });
  });

  describe("startVerification", () => {
    let startVerifyTimeFlip: number;
    beforeEach(() => {
      veaOutbox.estimateGas.startVerification.mockResolvedValue(1000);
      veaOutbox.startVerification.mockResolvedValue({ hash: "0x1234" });
      startVerifyTimeFlip =
        claim.timestampClaimed +
        mockGetBridgeConfig(chainId).epochPeriod +
        mockGetBridgeConfig(chainId).sequencerDelayLimit;
    });
    it("should start verification and set pending startVerification trnx", async () => {
      // Mock checkTransactionPendingStatus to always return false
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(false);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, claim, mockGetBridgeConfig);

      await transactionHandler.startVerification(startVerifyTimeFlip);

      expect(veaOutbox.estimateGas.startVerification).toHaveBeenCalledWith(epoch, claim);
      expect(veaOutbox.startVerification).toHaveBeenCalledWith(epoch, claim, { gasLimit: 1000 });
      expect(transactionHandler.pendingTransactions.startVerification).toEqual("0x1234");
    });

    it("should not start verification if timeout has not passed", async () => {
      // Mock checkTransactionPendingStatus to always return false
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(false);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, claim, mockGetBridgeConfig);

      await transactionHandler.startVerification(startVerifyTimeFlip - 1);

      expect(veaOutbox.estimateGas.startVerification).not.toHaveBeenCalled();
      expect(veaOutbox.startVerification).not.toHaveBeenCalled();
      expect(transactionHandler.pendingTransactions.startVerification).toBeNull();
    });

    it("should not start verification if claim is not set", async () => {
      // Mock checkTransactionPendingStatus to always return false
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(false);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, null, mockGetBridgeConfig);

      await expect(transactionHandler.startVerification(startVerifyTimeFlip)).rejects.toThrow(ClaimNotSetError);
    });

    it("should not start verification if a startVerification transaction is pending", async () => {
      // Mock checkTransactionPendingStatus to always return true
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(true);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, claim, mockGetBridgeConfig);
      await transactionHandler.startVerification(startVerifyTimeFlip);
      expect(veaOutbox.estimateGas.startVerification).not.toHaveBeenCalled();
      expect(veaOutbox.startVerification).not.toHaveBeenCalled();
      expect(transactionHandler.pendingTransactions.startVerification).toBeNull();
    });
  });

  describe("verifySnapshot", () => {
    let verificationFlipTime: number;
    beforeEach(() => {
      veaOutbox.estimateGas.verifySnapshot.mockResolvedValue(1000);
      veaOutbox.verifySnapshot.mockResolvedValue({ hash: "0x1234" });
      verificationFlipTime = claim.timestampClaimed + mockGetBridgeConfig(chainId).minChallengePeriod;
    });

    it("should verify snapshot and set pending verifySnapshot trnx", async () => {
      // Mock checkTransactionPendingStatus to always return false
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(false);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, claim, mockGetBridgeConfig);

      await transactionHandler.verifySnapshot(verificationFlipTime);

      expect(veaOutbox.estimateGas.verifySnapshot).toHaveBeenCalledWith(epoch, claim);
      expect(veaOutbox.verifySnapshot).toHaveBeenCalledWith(epoch, claim, { gasLimit: 1000 });
      expect(transactionHandler.pendingTransactions.verifySnapshot).toEqual("0x1234");
    });

    it("should not verify snapshot if timeout has not passed", async () => {
      // Mock checkTransactionPendingStatus to always return false
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(false);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, claim, mockGetBridgeConfig);

      await transactionHandler.verifySnapshot(verificationFlipTime - 1);

      expect(veaOutbox.estimateGas.verifySnapshot).not.toHaveBeenCalled();
      expect(veaOutbox.verifySnapshot).not.toHaveBeenCalled();
      expect(transactionHandler.pendingTransactions.verifySnapshot).toBeNull();
    });

    it("should not verify snapshot if claim is not set", async () => {
      // Mock checkTransactionPendingStatus to always return false
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(false);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, null, mockGetBridgeConfig);

      await expect(transactionHandler.verifySnapshot(verificationFlipTime)).rejects.toThrow(ClaimNotSetError);
    });

    it("should not verify snapshot if a verifySnapshot transaction is pending", async () => {
      // Mock checkTransactionPendingStatus to always return true
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(true);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, claim, mockGetBridgeConfig);

      await transactionHandler.verifySnapshot(verificationFlipTime);

      expect(veaOutbox.estimateGas.verifySnapshot).not.toHaveBeenCalled();
      expect(veaOutbox.verifySnapshot).not.toHaveBeenCalled();
      expect(transactionHandler.pendingTransactions.verifySnapshot).toBeNull();
    });
  });

  describe("withdrawClaimDeposit", () => {
    beforeEach(() => {
      veaOutbox.estimateGas.withdrawClaimDeposit.mockResolvedValue(1000);
      veaOutbox.withdrawClaimDeposit.mockResolvedValue({ hash: "0x1234" });
    });
    it("should withdraw deposit and set pending withdrawClaimDeposit trnx", async () => {
      // Mock checkTransactionPendingStatus to always return false
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(false);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, claim, mockGetBridgeConfig);

      await transactionHandler.withdrawClaimDeposit();
      expect(veaOutbox.estimateGas.withdrawClaimDeposit).toHaveBeenCalledWith(epoch, claim);
      expect(veaOutbox.withdrawClaimDeposit).toHaveBeenCalledWith(epoch, claim, { gasLimit: 1000 });
      expect(transactionHandler.pendingTransactions.withdrawClaimDeposit).toEqual("0x1234");
    });

    it("should not withdraw deposit if a withdrawClaimDeposit transaction is pending", async () => {
      // Mock checkTransactionPendingStatus to always return true
      jest.spyOn(TransactionHandler.prototype, "checkTransactionPendingStatus").mockResolvedValue(true);
      const transactionHandler = new TransactionHandler(chainId, epoch, veaOutbox, claim, mockGetBridgeConfig);

      await transactionHandler.withdrawClaimDeposit();
      expect(veaOutbox.estimateGas.withdrawClaimDeposit).not.toHaveBeenCalled();
      expect(veaOutbox.withdrawClaimDeposit).not.toHaveBeenCalled();
      expect(transactionHandler.pendingTransactions.withdrawClaimDeposit).toBeNull();
    });
  });
});
