import { ethers } from "ethers";
import {
  ArbToEthTransactionHandler,
  ArbToGnosisTransactionHandler,
  CannotFundError,
} from "../../utils/transactionHandlers";
import { resetNonceStuckAlerts } from "../../utils/transactionHandlers/arbToGnosisHandler";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { BotEvents } from "../../utils/botEvents";
import { MockEmitter } from "../../utils/emitter";
import { getWETH } from "../../utils/ethers";

jest.mock("../../utils/ethers", () => ({ getWETH: jest.fn() }));

const OUR_ADDRESS = "0x00000000000000000000000000000000000000aa";
const EPOCH = 488_888;
const claim: any = {
  stateRoot: "0x" + "66".repeat(32),
  claimer: "0x00000000000000000000000000000000000000c1",
  timestampClaimed: 1,
  timestampVerification: 0,
  blocknumberVerification: 0,
  honest: 0,
  challenger: OUR_ADDRESS,
};

const contractFn = (result: any = { hash: "0xtx" }, gas = BigInt(100_000)) => {
  const fn: any = jest.fn().mockResolvedValue(result);
  fn.estimateGas = jest.fn().mockResolvedValue(gas);
  return fn;
};

const outboxProvider = (balance: bigint, latestTimestamp = 0) => ({
  getBalance: jest.fn().mockResolvedValue(balance),
  getFeeData: jest.fn().mockResolvedValue({ maxFeePerGas: BigInt(1_000_000_000), gasPrice: BigInt(1_000_000_000) }),
  getBlock: jest.fn().mockResolvedValue({ number: 1, timestamp: latestTimestamp }),
  getTransactionReceipt: jest.fn().mockResolvedValue(null),
  getTransactionCount: jest.fn().mockResolvedValue(7),
  call: jest.fn(),
});

const cannotFundEvents = (emitter: MockEmitter) =>
  (emitter.emit as jest.Mock).mock.calls.filter(([event]) => event === BotEvents.CANNOT_FUND);

describe("actions: transaction handlers", () => {
  beforeEach(() => {
    // Pin the clock: nothing here may depend on how fast the machine runs.
    jest.useFakeTimers({ now: 1_700_000_000_000, doNotFake: ["nextTick", "queueMicrotask"] });
    resetNonceStuckAlerts();
  });
  afterEach(() => jest.useRealTimers());

  describe("PRD 4.8 runtime / C1 (BR-11): ArbToEth funding check", () => {
    const chainId = 11155111;
    const deposit = getBridgeConfig(chainId).routeConfig[Network.TESTNET].deposit;
    const challengeSig = "challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))";

    const build = (balance: bigint) => {
      const emitter = new MockEmitter();
      jest.spyOn(emitter, "emit");
      const veaOutbox: any = {
        runner: { address: OUR_ADDRESS },
        [challengeSig]: contractFn(),
        ["claim(uint256,bytes32)"]: contractFn(),
        claim: jest.fn().mockResolvedValue({ hash: "0xclaim" }),
      };
      const handler = new ArbToEthTransactionHandler({
        chainId,
        network: Network.TESTNET,
        epoch: EPOCH,
        veaInbox: {},
        veaOutbox,
        veaInboxProvider: {} as any,
        veaOutboxProvider: outboxProvider(balance) as any,
        emitter,
        claim: { ...claim, challenger: ethers.ZeroAddress },
      });
      return { handler, veaOutbox, emitter };
    };

    it("emits CANNOT_FUND and sends no challenge when the balance is below the deposit", async () => {
      const { handler, veaOutbox, emitter } = build(deposit - BigInt(1));
      await expect(handler.challengeClaim()).rejects.toThrow(CannotFundError);
      expect(veaOutbox[challengeSig]).not.toHaveBeenCalled();
      expect(veaOutbox[challengeSig].estimateGas).not.toHaveBeenCalled();
      const [[, payload]] = cannotFundEvents(emitter);
      expect(payload).toMatchObject({ chainId, network: Network.TESTNET, epoch: EPOCH, action: "challenge" });
      expect(payload.available).toBe((deposit - BigInt(1)).toString());
    });

    it("emits CANNOT_FUND when the deposit is covered but the gas is not", async () => {
      const { handler, veaOutbox, emitter } = build(deposit);
      await expect(handler.challengeClaim()).rejects.toThrow(CannotFundError);
      expect(veaOutbox[challengeSig]).not.toHaveBeenCalled();
      expect(cannotFundEvents(emitter)).toHaveLength(1);
    });

    it("challenges when deposit and gas are covered", async () => {
      const { handler, veaOutbox, emitter } = build(deposit * BigInt(2));
      await handler.challengeClaim();
      expect(veaOutbox[challengeSig]).toHaveBeenCalled();
      expect(cannotFundEvents(emitter)).toHaveLength(0);
    });

    it("emits CANNOT_FUND and sends no claim when the balance is short", async () => {
      const { handler, veaOutbox, emitter } = build(BigInt(0));
      await expect(handler.makeClaim(claim.stateRoot)).rejects.toThrow(CannotFundError);
      expect(veaOutbox.claim).not.toHaveBeenCalled();
      expect(cannotFundEvents(emitter)[0][1]).toMatchObject({ action: "claim" });
    });
  });

  describe("PRD 4.8 runtime / C1 (BR-11): ArbToGnosis WETH balance and allowance", () => {
    const chainId = 10200;
    const { routeConfig } = getBridgeConfig(chainId);
    const deposit = routeConfig[Network.TESTNET].deposit;
    let weth: any;

    const build = (nativeBalance = BigInt(10) ** BigInt(18)) => {
      const emitter = new MockEmitter();
      jest.spyOn(emitter, "emit");
      const veaOutbox: any = {
        runner: { address: OUR_ADDRESS },
        ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"]: contractFn(),
        challenge: jest.fn().mockResolvedValue({ hash: "0xchallenge" }),
        ["claim(uint256,bytes32)"]: contractFn(),
        claim: jest.fn().mockResolvedValue({ hash: "0xclaim" }),
      };
      const handler = new ArbToGnosisTransactionHandler({
        chainId,
        network: Network.TESTNET,
        epoch: EPOCH,
        veaInbox: {} as any,
        veaOutbox,
        veaInboxProvider: {} as any,
        veaOutboxProvider: outboxProvider(nativeBalance) as any,
        emitter,
        claim: { ...claim, challenger: ethers.ZeroAddress },
      });
      return { handler, veaOutbox, emitter };
    };

    beforeEach(() => {
      weth = {
        balanceOf: jest.fn().mockResolvedValue(deposit),
        allowance: jest.fn().mockResolvedValue(deposit),
        approve: jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue({}) }),
      };
      (getWETH as jest.Mock).mockReturnValue(weth);
    });

    it("emits CANNOT_FUND and sends no challenge when the WETH balance is short", async () => {
      weth.balanceOf.mockResolvedValue(deposit - BigInt(1));
      const { handler, veaOutbox, emitter } = build();
      await expect(handler.challengeClaim()).rejects.toThrow(CannotFundError);
      expect(veaOutbox.challenge).not.toHaveBeenCalled();
      expect(cannotFundEvents(emitter)[0][1]).toMatchObject({ chainId, action: "challenge (WETH balance)" });
    });

    it("emits CANNOT_FUND when the allowance stays short after approving", async () => {
      weth.allowance.mockResolvedValue(BigInt(0));
      const { handler, veaOutbox, emitter } = build();
      await expect(handler.challengeClaim()).rejects.toThrow(CannotFundError);
      expect(weth.approve).toHaveBeenCalled();
      expect(veaOutbox.challenge).not.toHaveBeenCalled();
      expect(cannotFundEvents(emitter)[0][1]).toMatchObject({ action: "challenge (WETH allowance)" });
    });

    it("approves a short allowance before challenging (challenge pulls WETH with transferFrom)", async () => {
      weth.allowance.mockResolvedValueOnce(BigInt(0)).mockResolvedValue(deposit * BigInt(10));
      const { handler, veaOutbox } = build();
      await handler.challengeClaim();
      expect(weth.approve).toHaveBeenCalled();
      expect(veaOutbox.challenge).toHaveBeenCalled();
    });

    it("emits CANNOT_FUND and sends no claim when there is no xDAI for gas", async () => {
      const { handler, veaOutbox, emitter } = build(BigInt(0));
      await expect(handler.makeClaim(claim.stateRoot)).rejects.toThrow(CannotFundError);
      expect(veaOutbox.claim).not.toHaveBeenCalled();
      expect(cannotFundEvents(emitter)).toHaveLength(1);
    });
  });

  describe("PRD 3.3 (BR-11): the contract's timeout rule and the escape-hatch transactions", () => {
    const chainId = 10200;
    const P = 3600;
    const TIMEOUT = 24;

    const build = (latestTimestamp: number, latestVerifiedEpoch: number) => {
      const emitter = new MockEmitter();
      jest.spyOn(emitter, "emit");
      const veaOutbox: any = {
        runner: { address: OUR_ADDRESS },
        latestVerifiedEpoch: jest.fn().mockResolvedValue(BigInt(latestVerifiedEpoch)),
        timeoutEpochs: jest.fn().mockResolvedValue(BigInt(TIMEOUT)),
        epochPeriod: jest.fn().mockResolvedValue(BigInt(P)),
        withdrawChallengerEscapeHatch: jest.fn().mockResolvedValue({ hash: "0xchallengerhatch" }),
        withdrawClaimerEscapeHatch: jest.fn().mockResolvedValue({ hash: "0xclaimerhatch" }),
      };
      const handler = new ArbToGnosisTransactionHandler({
        chainId,
        network: Network.TESTNET,
        epoch: EPOCH,
        veaInbox: {} as any,
        veaOutbox,
        veaInboxProvider: {} as any,
        veaOutboxProvider: outboxProvider(BigInt(1), latestTimestamp) as any,
        emitter,
        claim,
      });
      return { handler, veaOutbox, emitter };
    };

    it("is running while epochNow - latestVerifiedEpoch <= timeoutEpochs, shut down once it exceeds it", async () => {
      const verified = 1000;
      expect(await build((verified + TIMEOUT) * P + P - 1, verified).handler.isBridgeShutdown()).toBe(false);
      expect(await build((verified + TIMEOUT + 1) * P, verified).handler.isBridgeShutdown()).toBe(true);
    });

    it("sends withdrawChallengerEscapeHatch with the current claim and emits ESCAPE_HATCH", async () => {
      const { handler, veaOutbox, emitter } = build(0, 0);
      await handler.withdrawChallengerEscapeHatch();
      expect(veaOutbox.withdrawChallengerEscapeHatch).toHaveBeenCalledWith(EPOCH, claim);
      expect(handler.transactions.challengerEscapeHatchTxn).toMatchObject({ hash: "0xchallengerhatch" });
      expect(emitter.emit).toHaveBeenCalledWith(BotEvents.ESCAPE_HATCH, {
        chainId,
        network: Network.TESTNET,
        epoch: EPOCH,
        party: "challenger",
        action: "withdrawing",
      });
    });

    it("sends withdrawClaimerEscapeHatch once and not again while it is pending", async () => {
      const { handler, veaOutbox } = build(0, 0);
      await handler.withdrawClaimerEscapeHatch();
      await handler.withdrawClaimerEscapeHatch();
      expect(veaOutbox.withdrawClaimerEscapeHatch).toHaveBeenCalledTimes(1);
    });
  });
});
