import { ArbToGnosisDevnetTransactionHandler, ArbToGnosisTransactionHandler } from "./arbToGnosisHandler";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { getWETH } from "../ethers";
import { messageExecutor } from "../arbMsgExecutor";
import { ClaimNotSetError } from "../errors";
import {
  TransactionStatus,
  BaseTransactionHandlerConstructor,
  MAX_PENDING_TIME,
  Transaction,
  resetUnminedSends,
} from "./baseTransactionHandler";
import { MockEmitter } from "../emitter";
import { ethers } from "ethers";
import { ArbToEthTransactionHandler, CannotFundError } from "./index";
import { APPROVAL_RECEIPT_TIMEOUT_MS } from "./arbToGnosisHandler";
import { BotEvents } from "../botEvents";
import { signedSend, signedSendV5 } from "../../testUtils/signedSends";

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
    resetUnminedSends();
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
  sendTransaction: jest.fn().mockResolvedValue({}),
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
    resetUnminedSends();
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
    expect(alerts[0]).toMatchObject({
      level: "warn",
      chainId,
      network: Network.TESTNET,
      epoch: EPOCH,
      details: { action: "claim", pendingNonce: 8, latestNonce: 7, nonce: 7, contract: "outbox" },
    });

    // Next epoch, still stuck: no second approval, no claim (and no challenge either), and no
    // second alert for the same stuck nonce.
    const next = build(EPOCH + 1);
    await next.handler.makeClaim(claim.stateRoot);
    await next.handler.challengeClaim();
    expect(weth.approve).toHaveBeenCalledTimes(1);
    expect(next.veaOutbox.claim).not.toHaveBeenCalled();
    expect(next.veaOutbox.challenge).not.toHaveBeenCalled();
    expect(nonceStuckAlerts(emitter, EPOCH + 1)).toHaveLength(0);
    expect(nonceStuckAlerts(emitter)).toHaveLength(1);
  });

  it("alerts again once the stuck nonce is used and the next one gets stuck", async () => {
    outboxProvider.getTransactionCount.mockImplementation(async (_: string, tag: string) =>
      tag === "pending" ? 8 : 7
    );
    const { handler } = build();
    await handler.makeClaim(claim.stateRoot);
    await handler.makeClaim(claim.stateRoot);
    expect(nonceStuckAlerts(emitter)).toHaveLength(1);

    // The stuck transaction is mined: nonce 7 is used, and a fresh approval goes out at nonce 8,
    // which is itself never mined, so nonce 8 is stuck on the next cycle.
    outboxProvider.getTransactionCount.mockResolvedValue(8);
    weth.approve.mockImplementation(async () => {
      outboxProvider.getTransactionCount.mockImplementation(async (_: string, tag: string) =>
        tag === "pending" ? 9 : 8
      );
      return { hash: "0xapprove", wait: jest.fn(() => new Promise(() => {})) };
    });
    const cleared = handler.makeClaim(claim.stateRoot);
    await jest.advanceTimersByTimeAsync(APPROVAL_RECEIPT_TIMEOUT_MS);
    await cleared;
    expect(weth.approve).toHaveBeenCalledTimes(1);
    expect(nonceStuckAlerts(emitter)).toHaveLength(1);

    await handler.makeClaim(claim.stateRoot);
    expect(nonceStuckAlerts(emitter).map((alert) => alert.details.nonce)).toEqual([7, 8]);
    expect(weth.approve).toHaveBeenCalledTimes(1);
  });

  describe("a send of ours stuck past MAX_PENDING_TIME is re-broadcast unchanged, and no approval queues behind it", () => {
    const stuckAtSeven = () =>
      outboxProvider.getTransactionCount.mockImplementation(async (_: string, tag: string) =>
        tag === "pending" ? 8 : 7
      );
    const allNonceStuck = () => eventsOf(emitter, BotEvents.ALERT).filter((p) => p?.code === "NONCE_STUCK");

    it("the claim of an earlier epoch left unmined is re-broadcast as it was signed, and one NONCE_STUCK names it", async () => {
      // That claim's window closed: no handler sends it again, and a challenge needs this approval too.
      weth.allowance.mockResolvedValue(deposit);
      const earlier = build(EPOCH - 1);
      const { raw, response } = await signedSend({ nonce: 7, chainId });
      earlier.veaOutbox.claim.mockResolvedValueOnce(response);
      await earlier.handler.makeClaim(claim.stateRoot);
      weth.allowance.mockResolvedValue(BigInt(0));
      stuckAtSeven();
      jest.setSystemTime(Date.now() + MAX_PENDING_TIME + 1);
      const { handler, veaOutbox } = build();
      await handler.makeClaim(claim.stateRoot);
      expect(outboxProvider.sendTransaction.mock.calls).toEqual([[raw]]);
      expect(weth.approve).not.toHaveBeenCalled();
      expect(veaOutbox.claim).not.toHaveBeenCalled();
      // The approval's check alerts for nonce 7 with what is known of it; the re-broadcast does not repeat it.
      expect(allNonceStuck()).toEqual([
        {
          level: "warn",
          code: "NONCE_STUCK",
          chainId,
          network: Network.TESTNET,
          epoch: EPOCH - 1,
          details: {
            action: "claim",
            pendingNonce: 8,
            latestNonce: 7,
            nonce: 7,
            contract: "outbox",
            hash: response.hash,
            maxFeePerGas: (BigInt(40) * BigInt(1_000_000_000)).toString(),
            maxPriorityFeePerGas: (BigInt(2) * BigInt(1_000_000_000)).toString(),
          },
        },
      ]);
      // A challenge later in the cycle: no re-broadcast within MAX_PENDING_TIME, no second alert.
      const next = build(EPOCH + 1);
      await next.handler.challengeClaim();
      expect(next.veaOutbox.challenge).not.toHaveBeenCalled();
      expect(outboxProvider.sendTransaction).toHaveBeenCalledTimes(1);
      expect(allNonceStuck()).toHaveLength(1);
    });

    it("a stuck approval is re-broadcast, never replaced by a second one", async () => {
      const { raw, response } = await signedSend({ nonce: 7, chainId });
      weth.approve.mockImplementation(async () => {
        stuckAtSeven();
        return { ...response, wait: jest.fn(() => new Promise(() => {})) };
      });
      const { handler } = build();
      const first = handler.makeClaim(claim.stateRoot);
      await jest.advanceTimersByTimeAsync(APPROVAL_RECEIPT_TIMEOUT_MS);
      await first;
      // Within MAX_PENDING_TIME it is waited for, as before.
      await handler.makeClaim(claim.stateRoot);
      expect(outboxProvider.sendTransaction).not.toHaveBeenCalled();
      expect(nonceStuckAlerts(emitter)).toHaveLength(1);
      jest.setSystemTime(Date.now() + MAX_PENDING_TIME);
      await handler.makeClaim(claim.stateRoot);
      expect(weth.approve).toHaveBeenCalledTimes(1);
      expect(outboxProvider.sendTransaction.mock.calls).toEqual([[raw]]);
      expect(nonceStuckAlerts(emitter)).toHaveLength(1);
    });

    it("an approval evicted from the pool is re-broadcast once, and no fresh approval goes out at its nonce or behind it", async () => {
      const { raw, response } = await signedSend({ nonce: 7, chainId });
      weth.approve.mockImplementation(async () => {
        stuckAtSeven();
        return { ...response, wait: jest.fn(() => new Promise(() => {})) };
      });
      const { handler, veaOutbox } = build();
      const first = handler.makeClaim(claim.stateRoot);
      await jest.advanceTimersByTimeAsync(APPROVAL_RECEIPT_TIMEOUT_MS);
      await first;
      // Evicted: the node no longer counts it, so `pending` is back at `latest`, until it is re-broadcast.
      outboxProvider.getTransactionCount.mockResolvedValue(7);
      outboxProvider.sendTransaction.mockImplementation(async () => {
        stuckAtSeven();
        return {};
      });
      jest.setSystemTime(Date.now() + MAX_PENDING_TIME + 1);

      await handler.makeClaim(claim.stateRoot);

      expect(weth.approve).toHaveBeenCalledTimes(1);
      expect(outboxProvider.sendTransaction.mock.calls).toEqual([[raw]]);
      expect(veaOutbox.claim).not.toHaveBeenCalled();
      expect(nonceStuckAlerts(emitter).map((alert) => alert.details.nonce)).toEqual([7]);
    });
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
    resetUnminedSends();
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

describe("ArbToGnosisTransactionHandler: challenge fees and stuck transactions", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_700_000_000_000, doNotFake: ["nextTick", "queueMicrotask"] });
    resetUnminedSends();
    jest.clearAllMocks();
    // These tests run against the real Chiado configuration.
    (getBridgeConfig as jest.Mock).mockImplementation(jest.requireActual("../../consts/bridgeRoutes").getBridgeConfig);
  });
  afterEach(() => jest.useRealTimers());
  const chainId = 10200;
  const GWEI = BigInt(1_000_000_000);
  const GAS = BigInt(100_000);
  const deposit: bigint = jest.requireActual("../../consts/bridgeRoutes").getBridgeConfig(chainId).routeConfig[
    Network.TESTNET
  ].deposit;
  const challengeable = { ...claim, challenger: ethers.ZeroAddress };
  /** Our earlier send, broadcast more than MAX_PENDING_TIME ago and never mined, at the providers' nonce 7. */
  const stuck = (): Transaction => ({
    hash: "0xstuck",
    broadcastedTimestamp: Date.now() - MAX_PENDING_TIME - 1,
    nonce: 7,
    maxFeePerGas: BigInt(40) * GWEI,
    maxPriorityFeePerGas: BigInt(2) * GWEI,
  });

  let emitter: MockEmitter;
  let inboxProvider: ReturnType<typeof provider>;
  let outboxProvider: ReturnType<typeof provider>;
  let routerProvider: ReturnType<typeof provider>;
  let veaInbox: any;
  let veaOutbox: any;
  const build = (Handler: typeof ArbToGnosisTransactionHandler = ArbToGnosisTransactionHandler) =>
    new Handler({
      chainId,
      network: Network.TESTNET,
      epoch: EPOCH,
      veaInbox,
      veaOutbox,
      veaInboxProvider: inboxProvider as any,
      veaOutboxProvider: outboxProvider as any,
      veaRouterProvider: routerProvider as any,
      emitter,
      claim: challengeable,
    });

  beforeEach(() => {
    emitter = new MockEmitter();
    jest.spyOn(emitter, "emit");
    inboxProvider = provider();
    outboxProvider = provider();
    routerProvider = provider();
    veaInbox = { sendSnapshot: jest.fn().mockResolvedValue({ hash: "0xsnap" }) };
    veaOutbox = {
      runner: { address: OUR_ADDRESS },
      ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"]: contractFn({}, GAS),
      challenge: jest.fn().mockResolvedValue({ hash: "0xchallenge" }),
      ["claim(uint256,bytes32)"]: contractFn({}, GAS),
      claim: jest.fn().mockResolvedValue({ hash: "0xclaim" }),
      devnetAdvanceState: jest.fn().mockResolvedValue({ hash: "0xadvance" }),
    };
    // The allowance already covers the deposit: no approval is sent.
    (getWETH as jest.Mock).mockReturnValue({
      balanceOf: jest.fn().mockResolvedValue(deposit),
      allowance: jest.fn().mockResolvedValue(deposit),
      approve: jest.fn(),
    });
  });

  it("challenges at a fee cap lowered to the xDAI balance when it cannot pay the gas at the profit cap", async () => {
    // The profit cap is deposit / (gas * 6), about 333 gwei; the balance pays 100 gwei per gas unit.
    outboxProvider.getBalance.mockResolvedValue(GAS * BigInt(100) * GWEI);
    await build().challengeClaim();
    expect(veaOutbox.challenge).toHaveBeenCalledWith(EPOCH, challengeable, {
      maxFeePerGas: BigInt(100) * GWEI,
      maxPriorityFeePerGas: BigInt(100) * GWEI,
      gasLimit: GAS,
    });
    expect(eventsOf(emitter, BotEvents.CANNOT_FUND)).toEqual([]);
  });

  it("still raises CANNOT_FUND when the xDAI balance cannot pay the gas at the base fee", async () => {
    // No base fee in the latest block: the fee data's 1 gwei gas price stands in for it.
    const balance = GAS * GWEI - BigInt(1);
    outboxProvider.getBalance.mockResolvedValue(balance);
    await expect(build().challengeClaim()).rejects.toThrow(CannotFundError);
    expect(veaOutbox.challenge).not.toHaveBeenCalled();
    expect(eventsOf(emitter, BotEvents.CANNOT_FUND)).toEqual([
      expect.objectContaining({
        action: "challenge",
        required: (GAS * GWEI).toString(),
        available: balance.toString(),
      }),
    ]);
  });

  it("a node's INSUFFICIENT_FUNDS refusal of the challenge raises CANNOT_FUND", async () => {
    veaOutbox.challenge.mockRejectedValueOnce(
      Object.assign(new Error("insufficient funds for gas * price + value"), { code: "INSUFFICIENT_FUNDS" })
    );
    await expect(build().challengeClaim()).rejects.toThrow(CannotFundError);
    expect(eventsOf(emitter, BotEvents.CANNOT_FUND)).toEqual([
      expect.objectContaining({ action: "challenge", available: ONE_ETH.toString() }),
    ]);
  });

  it("a stuck challenge is re-broadcast as it was signed, never sent again at another nonce or fee", async () => {
    const { raw, response } = await signedSend({ nonce: 7, chainId, gasLimit: GAS });
    veaOutbox.challenge.mockResolvedValueOnce(response);
    const handler = build();
    await handler.challengeClaim();
    jest.setSystemTime(Date.now() + MAX_PENDING_TIME + 1);
    await handler.challengeClaim();
    expect(veaOutbox.challenge).toHaveBeenCalledTimes(1);
    expect(outboxProvider.sendTransaction.mock.calls).toEqual([[raw]]);
    expect(nonceStuckAlerts(emitter)).toEqual([
      expect.objectContaining({ details: expect.objectContaining({ hash: response.hash, nonce: 7 }) }),
    ]);
  });

  it("a stuck claim waits on its nonce", async () => {
    const handler = build();
    handler.transactions.claimTxn = stuck();
    await handler.makeClaim(claim.stateRoot);
    expect(veaOutbox.claim).not.toHaveBeenCalled();
    expect(nonceStuckAlerts(emitter)).toHaveLength(1);
  });

  it("a stuck sendSnapshot waits on the inbox chain's nonce", async () => {
    outboxProvider.getTransactionCount.mockResolvedValue(50);
    const handler = build();
    handler.transactions.sendSnapshotTxn = stuck();
    await handler.sendSnapshot();
    expect(veaInbox.sendSnapshot).not.toHaveBeenCalled();
    expect(inboxProvider.getTransactionCount).toHaveBeenCalledWith(OUR_ADDRESS, "latest");
    expect(nonceStuckAlerts(emitter)).toEqual([
      expect.objectContaining({ details: expect.objectContaining({ contract: "inbox", nonce: 7 }) }),
    ]);
  });

  it("a stuck execution is re-broadcast through the router chain, at that chain's nonce", async () => {
    const { raw, response } = await signedSendV5({ nonce: 7 });
    (messageExecutor as jest.Mock).mockResolvedValue(response);
    outboxProvider.getTransactionCount.mockResolvedValue(50);
    const handler = build();
    await handler.resolveChallengedClaim("0xsent");
    jest.setSystemTime(Date.now() + MAX_PENDING_TIME + 1);
    await handler.resolveChallengedClaim("0xsent");
    expect((messageExecutor as jest.Mock).mock.calls).toEqual([["0xsent", inboxProvider, routerProvider]]);
    expect(routerProvider.sendTransaction.mock.calls).toEqual([[raw]]);
    expect(routerProvider.getTransactionCount).toHaveBeenCalledWith(OUR_ADDRESS, "latest");
    expect(outboxProvider.sendTransaction).not.toHaveBeenCalled();
  });

  it("a send of the Arb-to-Eth route on Sepolia re-broadcasts the execution this route left stuck there, through its own provider of that chain", async () => {
    // Sepolia is this route's router chain and that route's outbox chain: one signer, one nonce sequence.
    const { raw, response } = await signedSendV5({ nonce: 7 });
    (messageExecutor as jest.Mock).mockResolvedValue(response);
    await build().resolveChallengedClaim("0xsent");
    jest.setSystemTime(Date.now() + MAX_PENDING_TIME + 1);
    const sepolia = provider();
    const execFn = jest.fn().mockResolvedValue({ hash: "0xexec" });
    const sepoliaRoute = new ArbToEthTransactionHandler({
      chainId: 11155111,
      network: Network.TESTNET,
      epoch: EPOCH,
      veaInbox: {} as any,
      veaOutbox: { runner: { address: OUR_ADDRESS } } as any,
      veaInboxProvider: provider() as any,
      veaOutboxProvider: sepolia as any,
      emitter,
      claim,
    });
    await sepoliaRoute.resolveChallengedClaim("0xother", execFn);
    expect(sepolia.sendTransaction.mock.calls).toEqual([[raw]]);
    expect(routerProvider.sendTransaction).not.toHaveBeenCalled();
    expect(execFn).toHaveBeenCalledTimes(1);
    expect(eventsOf(emitter, BotEvents.ALERT).filter((p) => p?.code === "NONCE_STUCK")).toEqual([
      expect.objectContaining({ chainId, details: expect.objectContaining({ contract: "router", nonce: 7 }) }),
    ]);
  });

  it("a stuck devnetAdvanceState waits on its nonce", async () => {
    const handler = build(ArbToGnosisDevnetTransactionHandler) as ArbToGnosisDevnetTransactionHandler;
    handler.transactions.devnetAdvanceStateTxn = stuck();
    await handler.devnetAdvanceState("0xroot");
    expect(veaOutbox.devnetAdvanceState).not.toHaveBeenCalled();
  });
});
