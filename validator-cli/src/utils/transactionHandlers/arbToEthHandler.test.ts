import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { ArbToEthTransactionHandler } from "./arbToEthHandler";
import { ContractType, BaseTransactionHandlerConstructor } from "./baseTransactionHandler";
import { MockEmitter } from "../../utils/emitter";
import { BotEvents } from "../../utils/botEvents";
import { ClaimNotSetError } from "../../utils/errors";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";

describe("ArbToEthTransactionHandler", () => {
  const chainId = 11155111;
  let epoch: number = 100;
  let veaInbox: any;
  let veaOutbox: any;
  let veaInboxProvider: any;
  let veaOutboxProvider: any;
  let claim: ClaimStruct = null;
  let transactionHandlerParams: BaseTransactionHandlerConstructor;
  const mockEmitter = new MockEmitter();
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
      saveSnapshot: jest.fn(),
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
  });
  describe("makeClaim", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    const { routeConfig } = getBridgeConfig(chainId);
    const deposit = routeConfig[Network.TESTNET].deposit;
    beforeEach(() => {
      const mockClaim = jest.fn().mockResolvedValue({ hash: "0x1234" }) as any;
      mockClaim.estimateGas = jest.fn().mockResolvedValue(BigInt(100000));
      veaOutbox["claim(uint256,bytes32)"] = mockClaim;

      transactionHandler = new ArbToEthTransactionHandler(transactionHandlerParams);
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
      expect(transactionHandler.transactions.claimTxn).toEqual({
        hash: "0x1234",
        broadcastedTimestamp: expect.any(Number),
      });
    });

    it("should not make a claim if a claim transaction is pending", async () => {
      // Mock checkTransactionPendingStatus to always return true
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      await transactionHandler.makeClaim(claim.stateRoot as string);
      expect(veaOutbox.claim).not.toHaveBeenCalled();
      expect(transactionHandler.transactions.claimTxn).toBeNull();
    });
  });

  describe("challengeClaim", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    beforeEach(() => {
      transactionHandler = new ArbToEthTransactionHandler(transactionHandlerParams);
      transactionHandler.claim = claim;
    });

    it("should throw error if claim is not set", async () => {
      transactionHandler.claim = null;
      await expect(transactionHandler.challengeClaim()).rejects.toThrow(ClaimNotSetError);
    });

    it("should not challenge claim if txn is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      transactionHandler.transactions.challengeTxn = { hash: "0x1234", broadcastedTimestamp: 1000 };
      await transactionHandler.challengeClaim();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        transactionHandler.transactions.challengeTxn,
        ContractType.OUTBOX,
        expect.any(Number)
      );
      expect(
        veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"]
      ).not.toHaveBeenCalled();
    });

    it("should challenge claim", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      const mockChallenge = jest.fn().mockResolvedValue({ hash: "0x1234" }) as any;
      mockChallenge.estimateGas = jest.fn().mockResolvedValue(BigInt(100000));
      veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"] = mockChallenge;
      await transactionHandler.challengeClaim();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        null,
        ContractType.OUTBOX,
        expect.any(Number)
      );
      expect(transactionHandler.transactions.challengeTxn).toEqual({
        hash: "0x1234",
        broadcastedTimestamp: expect.any(Number),
      });
    });

    it.todo("should set challengeTxn as completed when txn is final");
  });

  describe("sendSnapshot", () => {
    let transactionHandler: ArbToEthTransactionHandler;
    beforeEach(() => {
      transactionHandler = new ArbToEthTransactionHandler(transactionHandlerParams);
      transactionHandler.claim = claim;
    });

    it("should send snapshot", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      veaInbox.sendSnapshot.mockResolvedValue({ hash: "0x1234" });
      await transactionHandler.sendSnapshot();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        null,
        ContractType.INBOX,
        expect.any(Number)
      );
      expect(transactionHandler.transactions.sendSnapshotTxn).toEqual({
        hash: "0x1234",
        broadcastedTimestamp: expect.any(Number),
      });
    });

    it("should not send snapshot if txn is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      transactionHandler.transactions.sendSnapshotTxn = { hash: "0x1234", broadcastedTimestamp: 1000 };
      await transactionHandler.sendSnapshot();
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        transactionHandler.transactions.sendSnapshotTxn,
        ContractType.INBOX,
        expect.any(Number)
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
    beforeEach(() => {
      mockMessageExecutor = jest.fn();
      transactionHandler = new ArbToEthTransactionHandler(transactionHandlerParams);
    });
    it("should resolve challenged claim", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(0);
      transactionHandler.transactions.sendSnapshotTxn = { hash: "0x1234", broadcastedTimestamp: 1000 };
      mockMessageExecutor.mockResolvedValue({ hash: "0x1234" });
      await transactionHandler.resolveChallengedClaim(
        transactionHandler.transactions.sendSnapshotTxn.hash,
        mockMessageExecutor
      );
      expect(transactionHandler.transactions.executeSnapshotTxn).toEqual({
        hash: "0x1234",
        broadcastedTimestamp: expect.any(Number),
      });
    });

    it("should not resolve challenged claim if txn is pending", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(1);
      transactionHandler.transactions.executeSnapshotTxn = { hash: "0x1234", broadcastedTimestamp: 1000 };
      await transactionHandler.resolveChallengedClaim("0x1234", mockMessageExecutor);
      expect(transactionHandler.checkTransactionStatus).toHaveBeenCalledWith(
        transactionHandler.transactions.executeSnapshotTxn,
        ContractType.OUTBOX,
        expect.any(Number)
      );
    });
  });
});
