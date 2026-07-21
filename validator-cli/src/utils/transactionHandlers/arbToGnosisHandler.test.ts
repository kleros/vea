import { ArbToGnosisTransactionHandler } from "./arbToGnosisHandler";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { getWETH } from "../ethers";
import { messageExecutor } from "../arbMsgExecutor";
import { ClaimNotSetError } from "../errors";
import { TransactionStatus, BaseTransactionHandlerConstructor } from "./baseTransactionHandler";
import { MockEmitter } from "../emitter";

jest.mock("../../consts/bridgeRoutes", () => ({
  getBridgeConfig: jest.fn(),
  Network: { TESTNET: "testnet" },
}));
jest.mock("../ethers", () => ({
  getWETH: jest.fn(),
}));
jest.mock("../arbMsgExecutor", () => ({ messageExecutor: jest.fn() }));

describe("ArbToGnosisTransactionHandler", () => {
  const mockEmitter = new MockEmitter();
  const chainId = 11155111;
  const epoch = 42;
  const network = Network.TESTNET as any;
  const deposit = BigInt(1000);
  const depositToken = "0xToken";
  const outboxRPC = "https://rpc";
  const sequencerDelayLimit = 5;
  const minChallengePeriod = 3;
  const routeConfig = {
    [network]: { veaOutbox: { address: "0xOutbox" }, epochPeriod: 10, deposit },
  };

  let inboxProvider: any;
  let outboxProvider: any;
  let routerProvider: any;
  let veaInbox: any;
  let veaOutbox: any;
  let transactionHandler: ArbToGnosisTransactionHandler;
  let transactionHandlerParams: BaseTransactionHandlerConstructor;
  let claim: any;
  let weth: any;

  beforeEach(() => {
    // Mock bridge config
    (getBridgeConfig as jest.Mock).mockReturnValue({
      depositToken,
      outboxRPC,
      sequencerDelayLimit,
      minChallengePeriod,
      routeConfig,
    });

    // Providers
    inboxProvider = { getTransactionReceipt: jest.fn(), getBlock: jest.fn() };
    outboxProvider = { getTransactionReceipt: jest.fn(), getBlock: jest.fn() };
    routerProvider = { getTransactionReceipt: jest.fn(), getBlock: jest.fn() };

    // Stub veaInbox/veaOutbox contract methods
    veaInbox = {
      sendSnapshot: jest.fn().mockResolvedValue({ hash: "0xsnap" }),
    };
    veaOutbox = {
      ["claim(uint256,bytes32)"]: {
        estimateGas: jest.fn().mockResolvedValue(BigInt(12345)),
      },
      claim: jest.fn().mockResolvedValue({ hash: "0xclaim" }),
      ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"]: {
        estimateGas: jest.fn().mockResolvedValue(BigInt(54321)),
      },
      challenge: jest.fn().mockResolvedValue({ hash: "0xchallenge" }),
      runner: { address: "0xSigner" },
    };

    // Default claim object
    claim = {
      stateRoot: "0xdead",
      claimer: "0xabc",
      timestampClaimed: 1000,
      timestampVerification: 2000,
      blocknumberVerification: 0,
      honest: 1,
      challenger: "0xdef",
    };

    transactionHandlerParams = {
      chainId,
      network,
      epoch,
      veaInbox: veaInbox,
      veaOutbox: veaOutbox,
      veaInboxProvider: inboxProvider,
      veaOutboxProvider: outboxProvider,
      veaRouterProvider: routerProvider,
      emitter: mockEmitter,
      claim: null,
    };

    // Instantiate with no claim by default
    transactionHandler = new ArbToGnosisTransactionHandler(transactionHandlerParams);
    weth = {
      allowance: jest.fn().mockResolvedValue(BigInt(0)),
      approve: jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue({}) }),
    };
    (getWETH as jest.Mock).mockReturnValue(weth);
  });

  describe("approveWeth", () => {
    it("should approve WETH when allowance < deposit and then claim", async () => {
      await transactionHandler.approveWeth();
      expect(weth.allowance).toHaveBeenCalledWith("0xSigner", routeConfig[network].veaOutbox.address);
      expect(weth.approve).toHaveBeenCalled();
    });

    it("should not approve WETH if allowance >= deposit", async () => {
      weth.allowance.mockResolvedValue(deposit);
      await transactionHandler.makeClaim("0xroot");
      expect(weth.approve).not.toHaveBeenCalled();
    });
  });

  describe("makeClaim()", () => {
    it("should not claim if status is PENDING", async () => {
      transactionHandler.claim = claim;
      transactionHandler.transactions.claimTxn = { hash: "0x", broadcastedTimestamp: 0 };
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.PENDING);
      await transactionHandler.makeClaim("0xroot");
      expect(veaOutbox.claim).not.toHaveBeenCalled();
    });
    it("should make claim", async () => {
      await transactionHandler.makeClaim("0xroot");
      expect(veaOutbox.claim).toHaveBeenCalledWith(epoch, "0xroot", { gasLimit: BigInt(12345) });
      expect(transactionHandler.transactions.claimTxn).toHaveProperty("hash", "0xclaim");
    });
  });

  describe("challengeClaim()", () => {
    beforeEach(() => {
      transactionHandler = new ArbToGnosisTransactionHandler({
        chainId,
        network,
        epoch,
        veaInbox: veaInbox,
        veaOutbox: veaOutbox,
        veaInboxProvider: inboxProvider,
        veaOutboxProvider: outboxProvider,
        emitter: mockEmitter,
        claim,
      });
    });

    it("throws if claim not set", async () => {
      const h = new ArbToGnosisTransactionHandler({ ...transactionHandlerParams, claim: null });
      await expect(h.challengeClaim()).rejects.toThrow(ClaimNotSetError);
    });

    it("challenges when status NOT_MADE", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.NOT_MADE);
      await transactionHandler.challengeClaim();
      // Gas estimation
      expect(
        veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"].estimateGas
      ).toHaveBeenCalledWith(epoch, claim);
      // Challenge call with computed fees
      expect(veaOutbox.challenge).toHaveBeenCalled();
      expect(transactionHandler.transactions.challengeTxn).toHaveProperty("hash", "0xchallenge");
    });

    it("does not challenge if status PENDING", async () => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.PENDING);
      await transactionHandler.challengeClaim();
      expect(veaOutbox.challenge).not.toHaveBeenCalled();
    });
  });

  describe("sendSnapshot()", () => {
    it("throws if claim not set", async () => {
      await expect(transactionHandler.sendSnapshot()).rejects.toThrow(ClaimNotSetError);
    });

    it("sends snapshot when none pending", async () => {
      transactionHandler.claim = claim;
      await transactionHandler.sendSnapshot();
      expect(veaInbox.sendSnapshot).toHaveBeenCalledWith(epoch, BigInt(3000000), claim);
      expect(transactionHandler.transactions.sendSnapshotTxn).toHaveProperty("hash", "0xsnap");
    });

    it("does nothing if pending", async () => {
      transactionHandler.claim = claim;
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.PENDING);
      transactionHandler.transactions.sendSnapshotTxn = { hash: "0x", broadcastedTimestamp: 0 };
      await transactionHandler.sendSnapshot();
      expect(veaInbox.sendSnapshot).not.toHaveBeenCalled();
    });
  });

  describe("resolveChallengedClaim()", () => {
    beforeEach(() => {
      jest.spyOn(transactionHandler, "checkTransactionStatus").mockResolvedValue(TransactionStatus.NOT_MADE);
      (messageExecutor as jest.Mock).mockResolvedValue({ hash: "0xexec" });
    });

    it("throws if claim not set", async () => {
      await expect(transactionHandler.resolveChallengedClaim("0xtx")).rejects.toThrow(ClaimNotSetError);
    });

    it("executes and records transaction", async () => {
      transactionHandler = new ArbToGnosisTransactionHandler({ ...transactionHandlerParams, claim });
      await transactionHandler.resolveChallengedClaim("0xtx");
      expect(messageExecutor).toHaveBeenCalledWith("0xtx", inboxProvider, routerProvider);
      expect(transactionHandler.transactions.executeSnapshotTxn).toHaveProperty("hash", "0xexec");
    });
  });
});
