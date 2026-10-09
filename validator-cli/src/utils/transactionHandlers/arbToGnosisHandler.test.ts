import {
  ArbToGnosisDevnetTransactionHandler,
  ArbToGnosisTransactionHandler,
  resetNonceStuckAlerts,
} from "./arbToGnosisHandler";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { getWETH } from "../ethers";
import { messageExecutor } from "../arbMsgExecutor";
import { ClaimNotSetError } from "../errors";
import { TransactionStatus, BaseTransactionHandlerConstructor } from "./baseTransactionHandler";
import { MockEmitter } from "../emitter";
import { ethers } from "ethers";
import { ArbToEthTransactionHandler, CannotFundError } from "./index";
import { APPROVAL_RECEIPT_TIMEOUT_MS } from "./arbToGnosisHandler";
import { BotEvents } from "../botEvents";

jest.mock("../../consts/bridgeRoutes", () => ({
  getBridgeConfig: jest.fn(),
  Network: { TESTNET: "testnet" },
}));
jest.mock("../ethers", () => ({
  getWETH: jest.fn(),
}));
jest.mock("../arbMsgExecutor", () => ({ messageExecutor: jest.fn() }));

describe("ArbToGnosisTransactionHandler", () => {
  afterEach(() => jest.useRealTimers());

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
    // Pin the clock: nothing here may depend on how fast the machine runs.
    jest.useFakeTimers({ now: 1_700_000_000_000, doNotFake: ["nextTick", "queueMicrotask"] });
    resetNonceStuckAlerts();
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
    outboxProvider = {
      getTransactionReceipt: jest.fn(),
      getBlock: jest.fn(),
      getBalance: jest.fn().mockResolvedValue(BigInt(10) ** BigInt(18)),
      getFeeData: jest.fn().mockResolvedValue({ maxFeePerGas: BigInt(1), gasPrice: BigInt(1) }),
      getTransactionCount: jest.fn().mockResolvedValue(7),
    };
    routerProvider = {
      getTransactionReceipt: jest.fn(),
      getBlock: jest.fn(),
      getBalance: jest.fn().mockResolvedValue(BigInt(10) ** BigInt(18)),
    };

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
      balanceOf: jest.fn().mockResolvedValue(deposit),
      allowance: jest.fn().mockResolvedValue(BigInt(0)),
      approve: jest.fn().mockImplementation(async () => {
        weth.allowance.mockResolvedValue(deposit * BigInt(10));
        return { wait: jest.fn().mockResolvedValue({}) };
      }),
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

  describe("devnetAdvanceState()", () => {
    it("pays the deposit in WETH only: no native value goes to the outbox", async () => {
      veaOutbox.devnetAdvanceState = jest.fn().mockResolvedValue({ hash: "0xadvance" });
      const devnetHandler = new ArbToGnosisDevnetTransactionHandler(transactionHandlerParams);
      await devnetHandler.devnetAdvanceState("0xroot");
      expect(weth.approve).toHaveBeenCalled();
      expect(veaOutbox.devnetAdvanceState).toHaveBeenCalledWith(epoch, "0xroot");
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
const ONE_ETH = BigInt(10) ** BigInt(18);

const contractFn = (result: any = { hash: "0xtx" }, gas = BigInt(100_000)) => {
  const fn: any = jest.fn().mockResolvedValue(result);
  fn.estimateGas = jest.fn().mockResolvedValue(gas);
  return fn;
};

const provider = (balance: bigint = ONE_ETH) => ({
  getBalance: jest.fn().mockResolvedValue(balance),
  getFeeData: jest.fn().mockResolvedValue({ maxFeePerGas: BigInt(1_000_000_000), gasPrice: BigInt(1_000_000_000) }),
  getBlock: jest.fn().mockResolvedValue({ number: 1, timestamp: 0 }),
  getTransactionReceipt: jest.fn().mockResolvedValue(null),
  getTransactionCount: jest.fn().mockResolvedValue(7),
  call: jest.fn(),
});

const eventsOf = (emitter: MockEmitter, event: BotEvents) =>
  (emitter.emit as jest.Mock).mock.calls.filter(([e]) => e === event).map(([, payload]) => payload);
const nonceStuckAlerts = (emitter: MockEmitter, epoch = EPOCH) =>
  eventsOf(emitter, BotEvents.ALERT).filter((p) => p?.code === "NONCE_STUCK" && p.epoch === epoch);

describe("ArbToGnosisTransactionHandler: WETH approvals never block the bot", () => {
  beforeEach(() => {
    // Every wait below is driven by fake timers, never by the machine's speed.
    jest.useFakeTimers({ now: 1_700_000_000_000, doNotFake: ["nextTick", "queueMicrotask"] });
    resetNonceStuckAlerts();
    jest.clearAllMocks();
    // These tests run against the real Chiado configuration.
    (getBridgeConfig as jest.Mock).mockImplementation(jest.requireActual("../../consts/bridgeRoutes").getBridgeConfig);
  });
  afterEach(() => jest.useRealTimers());
  const chainId = 10200;
  const deposit: bigint = jest.requireActual("../../consts/bridgeRoutes").getBridgeConfig(chainId).routeConfig[
    Network.TESTNET
  ].deposit;
  let weth: any;
  let outboxProvider: ReturnType<typeof provider>;
  let emitter: MockEmitter;

  const build = (epoch = EPOCH) => {
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
      epoch,
      veaInbox: {} as any,
      veaOutbox,
      veaInboxProvider: {} as any,
      veaOutboxProvider: outboxProvider as any,
      emitter,
      claim: { ...claim, challenger: ethers.ZeroAddress },
    });
    return { handler, veaOutbox };
  };

  /** An approval that is broadcast (the pending nonce moves up) but never mined. */
  const neverMined = () => {
    weth.approve.mockImplementation(async () => {
      outboxProvider.getTransactionCount.mockImplementation(async (_: string, tag: string) =>
        tag === "pending" ? 8 : 7
      );
      return { hash: "0xapprove", wait: jest.fn(() => new Promise(() => {})) };
    });
  };

  beforeEach(() => {
    emitter = new MockEmitter();
    jest.spyOn(emitter, "emit");
    outboxProvider = provider();
    weth = {
      balanceOf: jest.fn().mockResolvedValue(deposit),
      allowance: jest.fn().mockResolvedValue(BigInt(0)),
      approve: jest.fn(),
    };
    (getWETH as jest.Mock).mockReturnValue(weth);
  });

  it("bounds the receipt wait at no more than 3 minutes", () => {
    expect(APPROVAL_RECEIPT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(APPROVAL_RECEIPT_TIMEOUT_MS).toBeLessThanOrEqual(3 * 60 * 1000);
  });

  it("sends no approval and reads no nonce when the allowance already covers the deposit", async () => {
    weth.allowance.mockResolvedValue(deposit);
    const { handler, veaOutbox } = build();
    await handler.makeClaim(claim.stateRoot);
    expect(weth.approve).not.toHaveBeenCalled();
    expect(outboxProvider.getTransactionCount).not.toHaveBeenCalled();
    expect(veaOutbox.claim).toHaveBeenCalled();
  });

  it("a never-mined approval returns after the bound, sends no claim, and nothing more over three stuck cycles and the next epoch", async () => {
    neverMined();
    const { handler, veaOutbox } = build(EPOCH);

    // Cycle 1: the approval is sent and its receipt never comes.
    let returned = false;
    const cycle1 = handler.makeClaim(claim.stateRoot).then(() => (returned = true));
    await jest.advanceTimersByTimeAsync(APPROVAL_RECEIPT_TIMEOUT_MS - 1);
    expect(returned).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await cycle1;
    expect(returned).toBe(true);
    expect(weth.approve).toHaveBeenCalledTimes(1);
    expect(veaOutbox.claim).not.toHaveBeenCalled();
    expect(eventsOf(emitter, BotEvents.TXN_PENDING)).toContain("0xapprove");

    // Cycles 2-4: the pending nonce is above latest; no second approval, one alert.
    for (let cycle = 0; cycle < 3; cycle++) await handler.makeClaim(claim.stateRoot);
    expect(weth.approve).toHaveBeenCalledTimes(1);
    expect(veaOutbox.claim).not.toHaveBeenCalled();
    const alerts = nonceStuckAlerts(emitter);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: "warn", chainId, network: Network.TESTNET, epoch: EPOCH });

    // Next epoch, still stuck: no second approval, no claim (and no challenge either).
    const next = build(EPOCH + 1);
    await next.handler.makeClaim(claim.stateRoot);
    await next.handler.challengeClaim();
    expect(weth.approve).toHaveBeenCalledTimes(1);
    expect(next.veaOutbox.claim).not.toHaveBeenCalled();
    expect(next.veaOutbox.challenge).not.toHaveBeenCalled();
    expect(nonceStuckAlerts(emitter, EPOCH + 1)).toHaveLength(1);
    expect(nonceStuckAlerts(emitter)).toHaveLength(1);
  });

  it("alerts again when the nonce gets stuck again after the condition cleared", async () => {
    outboxProvider.getTransactionCount.mockImplementation(async (_: string, tag: string) =>
      tag === "pending" ? 8 : 7
    );
    const { handler } = build();
    await handler.makeClaim(claim.stateRoot);
    await handler.makeClaim(claim.stateRoot);
    expect(nonceStuckAlerts(emitter)).toHaveLength(1);

    // The stuck transaction is mined: the condition clears and a fresh approval goes out,
    // which is itself never mined, so the nonce is stuck again on the next cycle.
    outboxProvider.getTransactionCount.mockResolvedValue(7);
    neverMined();
    const cleared = handler.makeClaim(claim.stateRoot);
    await jest.advanceTimersByTimeAsync(APPROVAL_RECEIPT_TIMEOUT_MS);
    await cleared;
    expect(weth.approve).toHaveBeenCalledTimes(1);
    expect(nonceStuckAlerts(emitter)).toHaveLength(1);

    await handler.makeClaim(claim.stateRoot);
    expect(nonceStuckAlerts(emitter)).toHaveLength(2);
    expect(weth.approve).toHaveBeenCalledTimes(1);
  });

  it("claims in the same cycle when the approval is mined within the bound", async () => {
    weth.approve.mockImplementation(async () => {
      weth.allowance.mockResolvedValue(deposit * BigInt(10));
      return { hash: "0xapprove", wait: jest.fn().mockResolvedValue({ status: 1 }) };
    });
    const { handler, veaOutbox } = build();
    await handler.makeClaim(claim.stateRoot);
    expect(weth.approve).toHaveBeenCalledTimes(1);
    expect(veaOutbox.claim).toHaveBeenCalled();
    expect(nonceStuckAlerts(emitter)).toHaveLength(0);
  });

  it("treats ethers' own TIMEOUT rejection of wait() as still pending, not as a failure", async () => {
    weth.approve.mockResolvedValue({
      hash: "0xapprove",
      wait: jest.fn().mockRejectedValue(Object.assign(new Error("timeout"), { code: "TIMEOUT" })),
    });
    const { handler, veaOutbox } = build();
    await expect(handler.challengeClaim()).resolves.toBeUndefined();
    expect(veaOutbox.challenge).not.toHaveBeenCalled();
  });

  it("a reverted approval still throws", async () => {
    weth.approve.mockResolvedValue({
      hash: "0xapprove",
      wait: jest.fn().mockRejectedValue(Object.assign(new Error("reverted"), { code: "CALL_EXCEPTION" })),
    });
    const { handler } = build();
    await expect(handler.makeClaim(claim.stateRoot)).rejects.toThrow("reverted");
  });
});

describe("ArbToGnosisTransactionHandler: the L1 execution is funded before messageExecutor runs", () => {
  beforeEach(() => {
    // Every wait below is driven by fake timers, never by the machine's speed.
    jest.useFakeTimers({ now: 1_700_000_000_000, doNotFake: ["nextTick", "queueMicrotask"] });
    resetNonceStuckAlerts();
    jest.clearAllMocks();
    // These tests run against the real Chiado configuration.
    (getBridgeConfig as jest.Mock).mockImplementation(jest.requireActual("../../consts/bridgeRoutes").getBridgeConfig);
  });
  afterEach(() => jest.useRealTimers());
  const build = (routerBalance: bigint) => {
    const emitter = new MockEmitter();
    jest.spyOn(emitter, "emit");
    const inboxProvider = provider();
    const outboxProvider = provider(ONE_ETH);
    const routerProvider = provider(routerBalance);
    const handler = new ArbToGnosisTransactionHandler({
      chainId: 10200,
      network: Network.TESTNET,
      epoch: EPOCH,
      veaInbox: {} as any,
      veaOutbox: { runner: { address: OUR_ADDRESS } } as any,
      veaInboxProvider: inboxProvider as any,
      veaOutboxProvider: outboxProvider as any,
      veaRouterProvider: routerProvider as any,
      emitter,
      claim,
    });
    return { handler, emitter, inboxProvider, outboxProvider, routerProvider };
  };

  it("reads veaRouterProvider.getBalance(runner address) before executing", async () => {
    (messageExecutor as jest.Mock).mockResolvedValue({ hash: "0xexec" });
    const { handler, inboxProvider, outboxProvider, routerProvider } = build(ONE_ETH);
    await handler.resolveChallengedClaim("0xsent");
    expect(routerProvider.getBalance).toHaveBeenCalledWith(OUR_ADDRESS);
    expect(outboxProvider.getBalance).not.toHaveBeenCalled();
    expect(messageExecutor).toHaveBeenCalledWith("0xsent", inboxProvider, routerProvider);
    expect(routerProvider.getBalance.mock.invocationCallOrder[0]).toBeLessThan(
      (messageExecutor as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(handler.transactions.executeSnapshotTxn).toMatchObject({ hash: "0xexec" });
  });

  it("emits CANNOT_FUND and does not execute when the router account is empty", async () => {
    const { handler, emitter } = build(BigInt(0));
    await expect(handler.resolveChallengedClaim("0xsent")).rejects.toThrow(CannotFundError);
    expect(messageExecutor).not.toHaveBeenCalled();
    expect(handler.transactions.executeSnapshotTxn).toBeNull();
    expect(eventsOf(emitter, BotEvents.CANNOT_FUND)).toEqual([
      {
        chainId: 10200,
        network: Network.TESTNET,
        epoch: EPOCH,
        action: "execute snapshot (router)",
        required: "0",
        available: "0",
      },
    ]);
  });

  it("executes anyway, with a ROUTER_BALANCE_UNKNOWN alert, when the router balance read fails", async () => {
    (messageExecutor as jest.Mock).mockResolvedValue({ hash: "0xexec" });
    const { handler, emitter, inboxProvider, routerProvider } = build(ONE_ETH);
    routerProvider.getBalance.mockRejectedValue(new Error("rpc down"));
    await handler.resolveChallengedClaim("0xsent");
    expect(messageExecutor).toHaveBeenCalledWith("0xsent", inboxProvider, routerProvider);
    expect(eventsOf(emitter, BotEvents.CANNOT_FUND)).toEqual([]);
    expect(eventsOf(emitter, BotEvents.ALERT)).toEqual([
      expect.objectContaining({ level: "warn", code: "ROUTER_BALANCE_UNKNOWN", chainId: 10200, epoch: EPOCH }),
    ]);
  });

  it("executes anyway when the router provider has no getBalance", async () => {
    (messageExecutor as jest.Mock).mockResolvedValue({ hash: "0xexec" });
    const { handler, routerProvider } = build(ONE_ETH);
    delete (routerProvider as any).getBalance;
    await handler.resolveChallengedClaim("0xsent");
    expect(messageExecutor).toHaveBeenCalledTimes(1);
  });

  it("ArbToEth: the L1 outbox account is checked the same way", async () => {
    const emitter = new MockEmitter();
    jest.spyOn(emitter, "emit");
    const outboxProvider = provider(BigInt(0));
    const execFn = jest.fn().mockResolvedValue({ hash: "0xexec" });
    const handler = new ArbToEthTransactionHandler({
      chainId: 11155111,
      network: Network.TESTNET,
      epoch: EPOCH,
      veaInbox: {} as any,
      veaOutbox: { runner: { address: OUR_ADDRESS } } as any,
      veaInboxProvider: provider() as any,
      veaOutboxProvider: outboxProvider as any,
      emitter,
      claim,
    });
    await expect(handler.resolveChallengedClaim("0xsent", execFn)).rejects.toThrow(CannotFundError);
    expect(execFn).not.toHaveBeenCalled();
    outboxProvider.getBalance.mockResolvedValue(ONE_ETH);
    await handler.resolveChallengedClaim("0xsent", execFn);
    expect(execFn).toHaveBeenCalledTimes(1);
  });
});
