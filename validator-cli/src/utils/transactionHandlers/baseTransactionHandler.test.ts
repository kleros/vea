import {
  BaseTransactionHandler,
  BaseTransactionHandlerConstructor,
  ContractType,
  TransactionStatus,
  MAX_PENDING_CONFIRMATIONS,
  MAX_PENDING_TIME,
  Transaction,
  resetUnminedSends,
} from "./baseTransactionHandler";
import { BotEvents } from "../botEvents";
import { ClaimNotSetError } from "../errors";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { ClaimStruct } from "../../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { MockEmitter } from "../emitter";
import { Interface, Wallet, keccak256 } from "ethers";
import { BigNumber } from "@ethersproject/bignumber";
import { feesOf, signedSend, TEST_SIGNER } from "../../testUtils/signedSends";
import { FallbackRpcProvider } from "../fallbackProvider";
import { FallbackProviderV5 } from "../fallbackProviderV5";

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

  // Pin the clock: nothing here may depend on how fast the machine runs.
  beforeAll(() => jest.useFakeTimers({ now: 1_700_000_000_000, doNotFake: ["nextTick", "queueMicrotask"] }));
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    resetUnminedSends();
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

  describe("checkTransactionStatus: settled only once the bot reads at or past it", () => {
    const LATEST = 1000;
    const HEAD_TIMESTAMP = 1_700_000_000;
    /** A chain whose `finalized` block trails `latest`; blocks are 12 s apart. */
    const chain = (finalized: number) => ({
      getTransactionReceipt: jest.fn(),
      getBlock: jest.fn(async (tag: string | number) => {
        const n = tag === "latest" ? LATEST : tag === "finalized" ? finalized : Number(tag);
        return { number: n, timestamp: HEAD_TIMESTAMP - (LATEST - n) * 12 };
      }),
    });
    const trnx: Transaction = { hash: "0xsettle", broadcastedTimestamp: 1000 };
    let emitter: MockEmitter;
    const build = (providers: { inbox?: any; outbox?: any; router?: any }) =>
      new DummyHandler({
        ...transactionHandlerParams,
        veaInboxProvider: providers.inbox ?? chain(LATEST),
        veaOutboxProvider: providers.outbox ?? chain(LATEST),
        veaRouterProvider: providers.router,
        emitter,
      });
    beforeEach(() => {
      emitter = new MockEmitter();
      jest.spyOn(emitter, "emit");
    });

    it("an outbox transaction 10+ blocks deep but above the outbox read block is not final", async () => {
      // A healthy chain: finalized 70 blocks (840 s) behind latest, so the read block is 930.
      const outbox = chain(930);
      outbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 950 });
      const handler = build({ outbox });
      expect(await handler.checkTransactionStatus(trnx, ContractType.OUTBOX, 1001)).toBe(TransactionStatus.NOT_FINAL);
      expect(emitter.emit).toHaveBeenCalledWith(BotEvents.TXN_NOT_FINAL, trnx.hash, 20);
      expect(await handler.toSubmitTransaction(trnx, ContractType.OUTBOX, 1001)).toBe(false);
    });

    it("an outbox transaction at or below the outbox read block is final", async () => {
      const outbox = chain(930);
      outbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 930 });
      const handler = build({ outbox });
      expect(await handler.checkTransactionStatus(trnx, ContractType.OUTBOX, 1001)).toBe(TransactionStatus.FINAL);
      expect(emitter.emit).toHaveBeenCalledWith(BotEvents.TXN_FINAL, trnx.hash, LATEST - 930);
    });

    it("the outbox read block is getOutboxReadBlock's: latest - 64 while the outbox chain's finality has stalled", async () => {
      // finalized is 500 blocks (6000 s) behind latest: a stall, read at 1000 - 64 = 936.
      const outbox = chain(500);
      const handler = build({ outbox });
      outbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 936 });
      expect(await handler.checkTransactionStatus(trnx, ContractType.OUTBOX, 1001)).toBe(TransactionStatus.FINAL);
      outbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 937 });
      expect(await handler.checkTransactionStatus(trnx, ContractType.OUTBOX, 1001)).toBe(TransactionStatus.NOT_FINAL);
    });

    it("an inbox transaction is final only at or below the inbox chain's finalized block", async () => {
      const inbox = chain(900);
      const outbox = chain(LATEST);
      const handler = build({ inbox, outbox });
      inbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 950 });
      expect(await handler.checkTransactionStatus(trnx, ContractType.INBOX, 1001)).toBe(TransactionStatus.NOT_FINAL);
      expect(emitter.emit).toHaveBeenCalledWith(BotEvents.TXN_NOT_FINAL, trnx.hash, 50);
      inbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 900 });
      expect(await handler.checkTransactionStatus(trnx, ContractType.INBOX, 1001)).toBe(TransactionStatus.FINAL);
      expect(inbox.getBlock).toHaveBeenCalledWith("finalized");
      expect(outbox.getBlock).not.toHaveBeenCalled();
    });

    it("a router transaction needs only its confirmations", async () => {
      const router = chain(900);
      router.getTransactionReceipt.mockResolvedValue({ blockNumber: LATEST - MAX_PENDING_CONFIRMATIONS });
      const handler = build({ router });
      expect(await handler.checkTransactionStatus(trnx, ContractType.ROUTER, 1001)).toBe(TransactionStatus.FINAL);
      expect(router.getBlock).not.toHaveBeenCalledWith("finalized");
    });

    it("a withdrawal is not sent again while its transaction is above the outbox read block", async () => {
      const outbox = chain(930);
      outbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 950 });
      const handler = build({ outbox });
      handler.claim = claim;
      handler.transactions.withdrawClaimDepositTxn = trnx;
      await handler.withdrawClaimDeposit();
      expect(veaOutbox.withdrawClaimDeposit).not.toHaveBeenCalled();
    });

    it("a failed censorship test is restarted once the first start is settled, and not again while the restart is above the read block", async () => {
      // The claimer restarts a Failed test with startVerification; the claim it reads at the read
      // block keeps the failed test until that block reaches the restart.
      const cfg = getBridgeConfig(chainId);
      const startTime = Number(claim.timestampClaimed) + cfg.sequencerDelayLimit + cfg.routeConfig[network].epochPeriod;
      const outbox = chain(930);
      outbox.getTransactionReceipt.mockImplementation(async (hash: string) => ({
        blockNumber: hash === "0xfirst" ? 900 : 950,
      }));
      const handler = build({ outbox });
      handler.claim = claim;
      handler.transactions.startVerificationTxn = { hash: "0xfirst", broadcastedTimestamp: 1000 };
      await handler.startVerification(startTime);
      expect(veaOutbox.startVerification).toHaveBeenCalledTimes(1);
      await handler.startVerification(startTime);
      expect(veaOutbox.startVerification).toHaveBeenCalledTimes(1);
    });

    it("a snapshot save is not sent again until the inbox finalized block, where the SnapshotSaved scan stops, reaches it", async () => {
      // saveSnapshot (snapshot.ts) asks the handler every cycle until that scan sees the save.
      const inbox = chain(900);
      inbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 950, status: 1 });
      const handler = build({ inbox });
      handler.transactions.saveSnapshotTxn = trnx;
      await handler.saveSnapshot();
      expect(veaInbox.saveSnapshot).not.toHaveBeenCalled();
      const settled = chain(950);
      settled.getTransactionReceipt.mockResolvedValue({ blockNumber: 950, status: 1 });
      handler.veaInboxProvider = settled as any;
      await handler.saveSnapshot();
      expect(veaInbox.saveSnapshot).toHaveBeenCalledTimes(1);
    });

    it("a reverted save goes out again once confirmed, with the inbox finalized block still below it", async () => {
      // The inbox finalized block trails latest by far more than the last 600 s of an epoch, where
      // saves are sent: held back until it reached the revert, the save would miss its epoch.
      const inbox = chain(900);
      inbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 950, status: 0 });
      const handler = build({ inbox });
      handler.transactions.saveSnapshotTxn = trnx;
      await handler.saveSnapshot();
      expect(veaInbox.saveSnapshot).toHaveBeenCalledTimes(1);
      expect(emitter.emit).toHaveBeenCalledWith(BotEvents.TXN_FINAL, trnx.hash, LATEST - 950);
    });

    describe("a mined save the inbox finalized block has not reached is superseded once it covers less than the inbox", () => {
      // The SnapshotSaved scan stops at that block, so saveSnapshot asks every cycle; Arbitrum's
      // finalized block trails latest by more than the 10-minute saving period.
      const INBOX = "0x00000000000000000000000000000000000000b1";
      const ROOT = "0x" + "44".repeat(32);
      const iface = new Interface(["event SnapshotSaved(bytes32 _snapshot, uint256 _epoch, uint64 _count)"]);
      const savedLog = (count: number) => ({
        address: INBOX,
        ...iface.encodeEventLog("SnapshotSaved", [ROOT, epoch, count]),
      });
      beforeEach(() => {
        veaInbox.target = INBOX;
        veaInbox.interface = iface;
      });
      afterEach(() => {
        delete veaInbox.target;
        delete veaInbox.interface;
      });

      it("re-saves when the inbox count is above the count its own SnapshotSaved log saved, and holds at that count", async () => {
        const inbox = chain(900);
        inbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 950, status: 1, logs: [savedLog(5)] });
        const handler = build({ inbox });
        handler.transactions.saveSnapshotTxn = trnx;
        await handler.saveSnapshot(5);
        expect(veaInbox.saveSnapshot).not.toHaveBeenCalled();
        await handler.saveSnapshot(6);
        expect(veaInbox.saveSnapshot).toHaveBeenCalledTimes(1);
      });

      it("holds a save with fewer than MAX_PENDING_CONFIRMATIONS whatever the count", async () => {
        const inbox = chain(900);
        inbox.getTransactionReceipt.mockResolvedValue({
          blockNumber: LATEST - MAX_PENDING_CONFIRMATIONS + 1,
          status: 1,
          logs: [savedLog(5)],
        });
        const handler = build({ inbox });
        handler.transactions.saveSnapshotTxn = trnx;
        await handler.saveSnapshot(6);
        expect(veaInbox.saveSnapshot).not.toHaveBeenCalled();
      });

      it("without a SnapshotSaved log in its receipt, the count it was sent for decides", async () => {
        const inbox = chain(900);
        const handler = build({ inbox });
        inbox.getTransactionReceipt.mockResolvedValue(null);
        await handler.saveSnapshot(5);
        expect(veaInbox.saveSnapshot).toHaveBeenCalledTimes(1);
        inbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 950, status: 1, logs: [] });
        await handler.saveSnapshot(5);
        expect(veaInbox.saveSnapshot).toHaveBeenCalledTimes(1);
        await handler.saveSnapshot(6);
        expect(veaInbox.saveSnapshot).toHaveBeenCalledTimes(2);
      });
    });

    it("a reverted inbox transaction is sent again while the inbox chain's finality has stalled, but not before it is confirmed", async () => {
      // A reverted sendSnapshot: finalized stopped 900 blocks back, and nothing bounds the inbox read block.
      const inbox = chain(100);
      const handler = build({ inbox });
      inbox.getTransactionReceipt.mockResolvedValue({ blockNumber: LATEST - MAX_PENDING_CONFIRMATIONS, status: 0 });
      expect(await handler.toSubmitTransaction(trnx, ContractType.INBOX, 1001)).toBe(true);
      inbox.getTransactionReceipt.mockResolvedValue({ blockNumber: LATEST - MAX_PENDING_CONFIRMATIONS + 1, status: 0 });
      expect(await handler.toSubmitTransaction(trnx, ContractType.INBOX, 1001)).toBe(false);
    });

    it("a reverted outbox transaction still waits for the outbox read block", async () => {
      // An outbox revert ("Claim already made.") usually means another transaction got in first: the
      // helper decides again only once it reads at a block that has it.
      const outbox = chain(930);
      outbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 950, status: 0 });
      const handler = build({ outbox });
      expect(await handler.checkTransactionStatus(trnx, ContractType.OUTBOX, 1001)).toBe(TransactionStatus.NOT_FINAL);
    });
  });

  describe("an EXPIRED transaction is re-broadcast unchanged, never sent again under a new nonce", () => {
    const GWEI = BigInt(1_000_000_000);
    const BASE_FEE = BigInt(20) * GWEI;
    const cfg = getBridgeConfig(chainId);
    const startTime = Number(claim.timestampClaimed) + cfg.sequencerDelayLimit + cfg.routeConfig[network].epochPeriod;
    const verifyTime = Number(claim.timestampVerification) + cfg.minChallengePeriod;
    /** A chain that returns no receipt, with the signer's `latest` nonce at `latestNonce`, whose node takes every broadcast. */
    const chain = (latestNonce = 7) => ({
      getTransactionReceipt: jest.fn().mockResolvedValue(null),
      getBlock: jest.fn().mockResolvedValue({
        number: 1000,
        timestamp: 1_700_000_000,
        baseFeePerGas: BigNumber.from(BASE_FEE.toString()),
      }),
      getTransactionCount: jest.fn().mockResolvedValue(latestNonce),
      sendTransaction: jest.fn().mockResolvedValue({}),
    });
    let start: number;
    let emitter: MockEmitter;
    let outbox: ReturnType<typeof chain>;
    let inbox: ReturnType<typeof chain>;
    let contract: any;
    let snapshotInbox: any;
    const build = (opts: Partial<BaseTransactionHandlerConstructor> = {}) =>
      new DummyHandler({
        ...transactionHandlerParams,
        veaInbox: snapshotInbox,
        veaOutbox: contract,
        veaInboxProvider: inbox as any,
        veaOutboxProvider: outbox as any,
        emitter,
        claim,
        ...opts,
      });
    const alerts = (code: string) =>
      (emitter.emit as jest.Mock).mock.calls
        .filter(([event, payload]) => event === BotEvents.ALERT && payload?.code === code)
        .map(([, payload]) => payload);
    const laterThanPendingTime = () => jest.setSystemTime(Date.now() + MAX_PENDING_TIME + 1);
    beforeEach(() => {
      start = Date.now();
      emitter = new MockEmitter();
      jest.spyOn(emitter, "emit");
      outbox = chain();
      inbox = chain();
      const method = () => jest.fn().mockResolvedValue({ hash: "0xfresh" });
      contract = {
        // Its signer is never asked to sign anything of its own: no fee bump, no fill, no self-transfer.
        runner: { address: TEST_SIGNER, sendTransaction: jest.fn() },
        startVerification: method(),
        verifySnapshot: method(),
        withdrawClaimDeposit: method(),
        withdrawChallengeDeposit: method(),
        withdrawClaimerEscapeHatch: method(),
        withdrawChallengerEscapeHatch: method(),
      };
      snapshotInbox = { runner: { address: TEST_SIGNER, sendTransaction: jest.fn() }, saveSnapshot: method() };
    });
    afterEach(() => jest.setSystemTime(start));

    it("re-broadcasts our own EXPIRED transaction byte for byte while its nonce is not used, sends nothing new, and raises NONCE_STUCK once", async () => {
      const { raw, response } = await signedSend({ nonce: 7 });
      contract.startVerification.mockResolvedValueOnce(response);
      const handler = build();
      await handler.startVerification(startTime);
      const sent = handler.transactions.startVerificationTxn!;
      expect(sent).toMatchObject({ hash: response.hash, nonce: 7, maxFeePerGas: BigInt(40) * GWEI, raw });

      laterThanPendingTime();
      await handler.startVerification(startTime);
      expect(contract.startVerification).toHaveBeenCalledTimes(1);
      expect(outbox.sendTransaction.mock.calls).toEqual([[raw]]);
      expect(outbox.getTransactionCount).toHaveBeenCalledWith(TEST_SIGNER, "latest");
      // The same record and hash, its fees untouched, re-broadcast just now.
      expect(handler.transactions.startVerificationTxn).toBe(sent);
      expect(sent).toMatchObject({
        hash: response.hash,
        broadcastedTimestamp: Date.now(),
        nonce: 7,
        maxFeePerGas: BigInt(40) * GWEI,
        maxPriorityFeePerGas: BigInt(2) * GWEI,
      });
      expect(alerts("NONCE_STUCK")).toEqual([
        {
          level: "warn",
          code: "NONCE_STUCK",
          chainId,
          network,
          epoch,
          details: {
            latestNonce: 7,
            nonce: 7,
            contract: ContractType.OUTBOX,
            hash: response.hash,
            maxFeePerGas: (BigInt(40) * GWEI).toString(),
            maxPriorityFeePerGas: (BigInt(2) * GWEI).toString(),
            baseFee: BASE_FEE.toString(),
          },
        },
      ]);

      // Re-broadcasts are MAX_PENDING_TIME apart; in between it is waited for, as any pending one.
      await handler.startVerification(startTime);
      expect(outbox.sendTransaction).toHaveBeenCalledTimes(1);
      laterThanPendingTime();
      await handler.startVerification(startTime);
      expect(outbox.sendTransaction.mock.calls).toEqual([[raw], [raw]]);
      expect(contract.startVerification).toHaveBeenCalledTimes(1);
      expect(alerts("NONCE_STUCK")).toHaveLength(1);
      expect(contract.runner.sendTransaction).not.toHaveBeenCalled();
    });

    it.each([
      ["startVerification", (h: DummyHandler) => h.startVerification(startTime)],
      ["verifySnapshot", (h: DummyHandler) => h.verifySnapshot(verifyTime)],
      ["withdrawClaimDeposit", (h: DummyHandler) => h.withdrawClaimDeposit()],
      ["withdrawChallengeDeposit", (h: DummyHandler) => h.withdrawChallengeDeposit()],
      ["withdrawClaimerEscapeHatch", (h: DummyHandler) => h.withdrawClaimerEscapeHatch()],
      ["withdrawChallengerEscapeHatch", (h: DummyHandler) => h.withdrawChallengerEscapeHatch()],
    ] as const)(
      "%s re-broadcasts its own stuck outbox transaction instead of sending it again",
      async (method, send) => {
        const { raw, response } = await signedSend({ nonce: 7 });
        contract[method].mockResolvedValueOnce(response);
        const handler = build();
        await send(handler);
        laterThanPendingTime();
        await send(handler);
        expect(contract[method]).toHaveBeenCalledTimes(1);
        expect(outbox.sendTransaction.mock.calls).toEqual([[raw]]);
      }
    );

    it("saveSnapshot re-broadcasts its stuck save on the inbox chain, at that chain's nonce", async () => {
      const { raw, response } = await signedSend({ nonce: 7 });
      snapshotInbox.saveSnapshot.mockResolvedValueOnce(response);
      outbox = chain(50);
      const handler = build();
      await handler.saveSnapshot();
      laterThanPendingTime();
      await handler.saveSnapshot();
      expect(snapshotInbox.saveSnapshot).toHaveBeenCalledTimes(1);
      expect(inbox.sendTransaction.mock.calls).toEqual([[raw]]);
      expect(inbox.getTransactionCount).toHaveBeenCalledWith(TEST_SIGNER, "latest");
      expect(outbox.getTransactionCount).not.toHaveBeenCalled();
      expect(alerts("NONCE_STUCK")).toEqual([
        expect.objectContaining({ details: expect.objectContaining({ nonce: 7, contract: ContractType.INBOX }) }),
      ]);
    });

    describe("a node's answer to the re-broadcast", () => {
      const body = (message: string) => JSON.stringify({ jsonrpc: "2.0", id: 42, error: { code: -32000, message } });
      /** How ethers v5, which the handlers broadcast through, throws a JSON-RPC error answer it does not map. */
      const v5Answer = (message: string) =>
        Object.assign(
          new Error(`processing response error (body=${JSON.stringify(body(message))}, code=SERVER_ERROR)`),
          {
            code: "SERVER_ERROR",
            error: Object.assign(new Error(message), { code: -32000 }),
            body: body(message),
          }
        );
      /** How ethers v6 throws one: unmapped, or mapped to a code with the answer in `info`. */
      const v6Answer = (message: string) =>
        Object.assign(new Error(`could not coalesce error (error={ "code": -32000, "message": "${message}" })`), {
          code: "UNKNOWN_ERROR",
          error: { code: -32000, message },
        });
      const v6NonceExpired = (message: string) =>
        Object.assign(new Error("nonce has already been used (code=NONCE_EXPIRED)"), {
          code: "NONCE_EXPIRED",
          info: { error: { code: -32000, message } },
        });
      /** Our own send at nonce 7, EXPIRED, re-broadcast to a node that answers `error`. */
      const rebroadcastTo = async (error: Error) => {
        const { response } = await signedSend({ nonce: 7 });
        contract.startVerification.mockResolvedValueOnce(response);
        const handler = build();
        await handler.startVerification(startTime);
        laterThanPendingTime();
        outbox.sendTransaction.mockRejectedValueOnce(error);
        await handler.startVerification(startTime);
        return response;
      };

      it.each([
        ["geth's already known", v5Answer("already known")],
        ["Nethermind's AlreadyKnown", v5Answer("AlreadyKnown")],
        ["Besu's Known transaction", v5Answer("Known transaction: 0x1234")],
        ["an ALREADY_EXISTS", v5Answer("ALREADY_EXISTS: already known")],
        ["already known, as ethers v6 throws it", v6Answer("already known")],
      ])("%s is no failure: nothing else is sent, and NONCE_STUCK still fires", async (_, error) => {
        await rebroadcastTo(error);
        expect(contract.startVerification).toHaveBeenCalledTimes(1);
        expect(alerts("TXN_REBROADCAST_FAILED")).toEqual([]);
        expect(alerts("NONCE_STUCK")).toHaveLength(1);
      });

      it.each([
        [
          "nonce too low, mapped to NONCE_EXPIRED by ethers v5",
          Object.assign(v5Answer("nonce too low"), { code: "NONCE_EXPIRED" }),
        ],
        [
          "nonce too low, mapped to NONCE_EXPIRED by ethers v6",
          v6NonceExpired("nonce too low: next nonce 8, tx nonce 7"),
        ],
        ["Nethermind's OldNonce", v5Answer("OldNonce")],
      ])(
        "%s is no failure: it was mined or its nonce taken, so no NONCE_STUCK and nothing else is sent",
        async (_, error) => {
          await rebroadcastTo(error);
          expect(contract.startVerification).toHaveBeenCalledTimes(1);
          expect(alerts("TXN_REBROADCAST_FAILED")).toEqual([]);
          expect(alerts("NONCE_STUCK")).toEqual([]);
        }
      );

      it("any other refusal is logged as TXN_REBROADCAST_FAILED, and still nothing else is sent", async () => {
        const response = await rebroadcastTo(v5Answer("replacement transaction underpriced"));
        expect(contract.startVerification).toHaveBeenCalledTimes(1);
        expect(alerts("TXN_REBROADCAST_FAILED")).toEqual([
          {
            level: "warn",
            code: "TXN_REBROADCAST_FAILED",
            chainId,
            network,
            epoch,
            details: {
              hash: response.hash,
              nonce: 7,
              contract: ContractType.OUTBOX,
              message: expect.stringContaining("replacement transaction underpriced"),
            },
          },
        ]);
        expect(alerts("NONCE_STUCK")).toHaveLength(1);
      });
    });

    it("a nonce used with no receipt for our hash was taken outside this process: the action is sent afresh", async () => {
      const { response } = await signedSend({ nonce: 7 });
      contract.startVerification.mockResolvedValueOnce(response);
      const handler = build();
      await handler.startVerification(startTime);
      laterThanPendingTime();
      outbox.getTransactionCount.mockResolvedValue(8);
      await handler.startVerification(startTime);
      expect(contract.startVerification.mock.calls).toEqual([
        [epoch, claim],
        [epoch, claim],
      ]);
      expect(handler.transactions.startVerificationTxn).toMatchObject({ hash: "0xfresh" });
      expect(outbox.sendTransaction).not.toHaveBeenCalled();
      expect(alerts("NONCE_STUCK")).toEqual([]);
    });

    it("a nonce used because it was mined since its receipt was read is not sent again", async () => {
      const { response } = await signedSend({ nonce: 7 });
      contract.startVerification.mockResolvedValueOnce(response);
      const handler = build();
      await handler.startVerification(startTime);
      laterThanPendingTime();
      outbox.getTransactionCount.mockResolvedValue(8);
      outbox.getTransactionReceipt.mockResolvedValueOnce(null).mockResolvedValue({ blockNumber: 999, status: 1 });
      await handler.startVerification(startTime);
      expect(contract.startVerification).toHaveBeenCalledTimes(1);
      expect(outbox.sendTransaction).not.toHaveBeenCalled();
    });

    it("an EXPIRED record whose signed bytes are not known still waits on its nonce, and raises NONCE_STUCK", async () => {
      const handler = build();
      handler.transactions.startVerificationTxn = {
        hash: "0xstuck",
        broadcastedTimestamp: Date.now() - MAX_PENDING_TIME - 1,
        nonce: 7,
        gasPrice: BigInt(10) * GWEI,
      };
      await handler.startVerification(startTime);
      expect(contract.startVerification).not.toHaveBeenCalled();
      expect(outbox.sendTransaction).not.toHaveBeenCalled();
      expect(alerts("NONCE_STUCK")).toEqual([
        expect.objectContaining({
          details: expect.objectContaining({ hash: "0xstuck", nonce: 7, gasPrice: (BigInt(10) * GWEI).toString() }),
        }),
      ]);
    });

    it("a response whose fields do not hash back to it keeps no signed bytes: nothing is broadcast in its name", async () => {
      const { response } = await signedSend({ nonce: 7 });
      // Reported at other fees than it was signed with: rebuilt, it is not this transaction.
      contract.startVerification.mockResolvedValueOnce({ ...response, maxFeePerGas: BigInt(45) * GWEI });
      const handler = build();
      await handler.startVerification(startTime);
      expect(handler.transactions.startVerificationTxn).toMatchObject({ hash: response.hash, nonce: 7 });
      expect(handler.transactions.startVerificationTxn!.raw).toBeUndefined();
      laterThanPendingTime();
      await handler.startVerification(startTime);
      expect(contract.startVerification).toHaveBeenCalledTimes(1);
      expect(outbox.sendTransaction).not.toHaveBeenCalled();
      expect(alerts("NONCE_STUCK")).toHaveLength(1);
    });

    it("a first send reads no nonce; a record without a nonce is sent fresh, as before", async () => {
      const handler = build();
      await handler.startVerification(startTime);
      expect(contract.startVerification).toHaveBeenCalledWith(epoch, claim);
      expect(outbox.getTransactionCount).not.toHaveBeenCalled();
      handler.transactions.startVerificationTxn = {
        hash: "0xold",
        broadcastedTimestamp: Date.now() - MAX_PENDING_TIME - 1,
      };
      await handler.startVerification(startTime);
      expect(contract.startVerification).toHaveBeenCalledTimes(2);
    });

    it.each([
      ["an EIP-1559 transaction", {}],
      ["a legacy transaction", { gasPrice: BigInt(10) * GWEI }],
    ])(
      "%s stuck for an hour only ever goes out again as its original bytes: no other nonce, no higher fee",
      async (_, fees) => {
        const own = await signedSend({ nonce: 7, ...fees });
        const orphan = await signedSend({ nonce: 8, ...fees });
        contract.withdrawClaimDeposit.mockResolvedValueOnce(own.response);
        const handler = build();
        await handler.withdrawClaimDeposit();
        contract.startVerification.mockResolvedValueOnce(orphan.response);
        await build({ epoch: epoch - 1 }).startVerification(startTime);
        for (let round = 0; round < 12; round++) {
          laterThanPendingTime();
          await handler.withdrawClaimDeposit();
        }
        const broadcast = outbox.sendTransaction.mock.calls.map(([raw]) => raw);
        expect(broadcast).toHaveLength(24);
        expect(broadcast.filter((raw) => raw !== own.raw && raw !== orphan.raw)).toEqual([]);
        for (const raw of broadcast) {
          const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } = feesOf(raw);
          expect({ maxFeePerGas, maxPriorityFeePerGas, gasPrice }).toEqual(
            "gasPrice" in fees
              ? { maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: fees.gasPrice }
              : { maxFeePerGas: BigInt(40) * GWEI, maxPriorityFeePerGas: BigInt(2) * GWEI, gasPrice: null }
          );
        }
        // Each action was sent once, and the signer signed nothing else.
        expect(contract.withdrawClaimDeposit.mock.calls).toEqual([[epoch, claim]]);
        expect(contract.startVerification).toHaveBeenCalledTimes(1);
        expect(contract.runner.sendTransaction).not.toHaveBeenCalled();
      }
    );

    describe("whichever handler sent it", () => {
      // A handler the watcher dropped (a snapshot handler at rollover, a devnet epoch, an epoch that
      // left the watch) or one that no longer sends it (a claim whose window closed) never looks at
      // its stuck transaction again, which holds every later send of ours on that chain. The next
      // send of ours to that chain re-broadcasts it, unchanged, and still goes out itself.

      it("the next epoch's save re-broadcasts the save its dropped predecessor left stuck, and goes out fresh behind it", async () => {
        const { raw, response } = await signedSend({ nonce: 7 });
        snapshotInbox.saveSnapshot.mockResolvedValueOnce(response);
        await build({ epoch: epoch - 1 }).saveSnapshot();
        laterThanPendingTime();
        await build().saveSnapshot();
        expect(inbox.sendTransaction.mock.calls).toEqual([[raw]]);
        expect(snapshotInbox.saveSnapshot.mock.calls).toEqual([[], []]);
        expect(outbox.sendTransaction).not.toHaveBeenCalled();
        expect(alerts("NONCE_STUCK")).toEqual([
          expect.objectContaining({
            epoch: epoch - 1,
            details: expect.objectContaining({ hash: response.hash, nonce: 7, contract: ContractType.INBOX }),
          }),
        ]);
        expect(snapshotInbox.runner.sendTransaction).not.toHaveBeenCalled();
      });

      it("an outbox send of another route and epoch re-broadcasts every stuck outbox send of ours, lowest nonce first", async () => {
        const low = await signedSend({ nonce: 7 });
        const high = await signedSend({ nonce: 8, maxFeePerGas: BigInt(50) * GWEI });
        contract.startVerification.mockResolvedValueOnce(low.response);
        await build({ network: Network.DEVNET }).startVerification(startTime);
        contract.withdrawClaimDeposit.mockResolvedValueOnce(high.response);
        await build({ epoch: epoch - 1 }).withdrawClaimDeposit();
        laterThanPendingTime();
        await build({ epoch: epoch + 5 }).withdrawChallengeDeposit();
        expect(outbox.sendTransaction.mock.calls).toEqual([[low.raw], [high.raw]]);
        expect(contract.withdrawChallengeDeposit).toHaveBeenCalledWith(epoch + 5, claim);
        expect(alerts("NONCE_STUCK").map(({ network, epoch, details }) => [network, epoch, details.nonce])).toEqual([
          [Network.DEVNET, epoch, 7],
          [Network.TESTNET, epoch - 1, 8],
        ]);
        // Paced like any re-broadcast: not again within MAX_PENDING_TIME.
        await build({ epoch: epoch + 6 }).withdrawChallengeDeposit();
        expect(outbox.sendTransaction).toHaveBeenCalledTimes(2);
      });

      it("a send younger than MAX_PENDING_TIME, one on another chain, or one whose nonce is used is left alone", async () => {
        const save = await signedSend({ nonce: 7 });
        const used = await signedSend({ nonce: 6 });
        snapshotInbox.saveSnapshot.mockResolvedValueOnce(save.response);
        await build().saveSnapshot();
        contract.startVerification.mockResolvedValueOnce(used.response);
        await build({ epoch: epoch - 1 }).startVerification(startTime);
        // Within MAX_PENDING_TIME nothing is re-broadcast, and no nonce is read for it.
        await build({ epoch: epoch + 1 }).withdrawClaimDeposit();
        expect(outbox.getTransactionCount).not.toHaveBeenCalled();
        laterThanPendingTime();
        await build({ epoch: epoch + 2 }).withdrawClaimDeposit();
        expect(outbox.getTransactionCount).toHaveBeenCalledWith(TEST_SIGNER, "latest");
        expect(outbox.sendTransaction).not.toHaveBeenCalled();
        expect(inbox.sendTransaction).not.toHaveBeenCalled();
        expect(contract.withdrawClaimDeposit.mock.calls).toEqual([
          [epoch + 1, claim],
          [epoch + 2, claim],
        ]);
        expect(alerts("NONCE_STUCK")).toEqual([]);
      });

      it("a send evicted from every mempool frees its nonce: another action's fresh send takes it at the fee data of its own send time, the evicted action goes out fresh at the next nonce, and nothing is re-priced", async () => {
        // The node's view of the signer on the outbox chain: nonces below `latest` mined, the pool by nonce.
        let latest = 7;
        const pool = new Map<number, string>();
        const mined = new Set<string>();
        let baseFee = BigInt(20) * GWEI;
        let feeData = { maxFeePerGas: BigInt(42) * GWEI, maxPriorityFeePerGas: BigInt(2) * GWEI };
        const pending = () => {
          let nonce = latest;
          while (pool.has(nonce)) nonce++;
          return nonce;
        };
        const mine = () => {
          for (; pool.has(latest); latest++) {
            mined.add(keccak256(pool.get(latest)!));
            pool.delete(latest);
          }
        };
        outbox.getTransactionCount.mockImplementation(async (_: string, tag: string) =>
          tag === "pending" ? pending() : latest
        );
        outbox.getTransactionReceipt.mockImplementation(async (hash: string) =>
          mined.has(hash) ? { blockNumber: 999, status: 1 } : null
        );
        outbox.getBlock.mockImplementation(async () => ({
          number: 1000,
          timestamp: 1_700_000_000,
          baseFeePerGas: BigNumber.from(baseFee.toString()),
        }));
        // A node refuses a transaction whose nonce is used, or whose fee cap is under the base fee.
        outbox.sendTransaction.mockImplementation(async (raw: string) => {
          const { nonce, maxFeePerGas } = feesOf(raw);
          if (nonce < latest) throw Object.assign(new Error("nonce too low"), { code: "NONCE_EXPIRED" });
          if (maxFeePerGas! < baseFee) throw new Error("max fee per gas less than block base fee");
          pool.set(nonce, raw);
          return {};
        });
        /** Every transaction the signer signed, with the fee data of the moment it signed it. */
        const signed: { raw: string; feeData: typeof feeData }[] = [];
        /** A contract call as ethers' Wallet sends one without overrides: at the `pending` nonce and the fee data of the moment. */
        const marketSend = async () => {
          const { raw, response } = await signedSend({ nonce: pending(), ...feeData });
          signed.push({ raw, feeData });
          pool.set(response.nonce, raw);
          return response;
        };
        contract.withdrawClaimDeposit.mockImplementation(marketSend);
        contract.startVerification.mockImplementation(marketSend);

        const owner = build();
        await owner.withdrawClaimDeposit();
        const evicted = owner.transactions.withdrawClaimDepositTxn!;
        expect(evicted).toMatchObject({ nonce: 7, maxFeePerGas: BigInt(42) * GWEI });

        // The base fee climbs past its fee cap and every node drops it: nonce 7 is free again.
        laterThanPendingTime();
        baseFee = BigInt(50) * GWEI;
        feeData = { maxFeePerGas: BigInt(103) * GWEI, maxPriorityFeePerGas: BigInt(3) * GWEI };
        pool.delete(7);

        // Another action's send re-broadcasts it unchanged, which the node refuses, then takes 7 at today's fee data.
        await build({ epoch: epoch - 1 }).startVerification(startTime);
        expect(outbox.sendTransaction.mock.calls).toEqual([[evicted.raw]]);
        expect(contract.startVerification.mock.calls).toEqual([[epoch - 1, claim]]);
        expect(feesOf(signed[1].raw)).toEqual({
          nonce: 7,
          maxFeePerGas: BigInt(103) * GWEI,
          maxPriorityFeePerGas: BigInt(3) * GWEI,
          gasPrice: null,
        });

        // Mined at 7, with no receipt for the evicted hash: its action goes out fresh at 8, at the fee data of then.
        mine();
        laterThanPendingTime();
        baseFee = BigInt(40) * GWEI;
        feeData = { maxFeePerGas: BigInt(81) * GWEI, maxPriorityFeePerGas: BigInt(1) * GWEI };
        await owner.withdrawClaimDeposit();
        expect(contract.withdrawClaimDeposit.mock.calls).toEqual([
          [epoch, claim],
          [epoch, claim],
        ]);
        expect(feesOf(signed[2].raw)).toEqual({
          nonce: 8,
          maxFeePerGas: BigInt(81) * GWEI,
          maxPriorityFeePerGas: BigInt(1) * GWEI,
          gasPrice: null,
        });
        expect(owner.transactions.withdrawClaimDepositTxn).toMatchObject({ hash: keccak256(signed[2].raw), nonce: 8 });

        // Every transaction handed to a node pays the fee data of its own send time, never more; a
        // re-broadcast is its original bytes. The signer signed nothing else.
        const handed = [...signed.map(({ raw }) => raw), ...outbox.sendTransaction.mock.calls.map(([raw]) => raw)];
        expect(handed).toHaveLength(4);
        for (const raw of handed) {
          const { maxFeePerGas, maxPriorityFeePerGas } = feesOf(raw);
          expect({ maxFeePerGas, maxPriorityFeePerGas }).toEqual(signed.find((s) => s.raw === raw)?.feeData);
        }
        expect(contract.runner.sendTransaction).not.toHaveBeenCalled();
        expect(alerts("NONCE_STUCK").map(({ details }) => [details.nonce, details.hash])).toEqual([[7, evicted.hash]]);
      });
    });
  });
});

describe("BaseTransactionHandler: sends through the fallback providers", () => {
  // Real timers here: ethers detects the network on a timer.
  const PRIMARY = "https://primary.example";
  const BACKUP = "https://backup.example";
  const chainId = 11155111;
  const claim: ClaimStruct = {
    stateRoot: "0x" + "11".repeat(32),
    claimer: "0x00000000000000000000000000000000000000c1",
    timestampClaimed: 1000,
    timestampVerification: 0,
    blocknumberVerification: 0,
    honest: 0,
    challenger: "0x0000000000000000000000000000000000000000",
  };
  const cfg = getBridgeConfig(chainId);
  const startTime =
    Number(claim.timestampClaimed) + cfg.sequencerDelayLimit + cfg.routeConfig[Network.TESTNET].epochPeriod;
  const down = () => Object.assign(new Error("missing response (serverError={})"), { code: "SERVER_ERROR" });
  /** ethers v5's throw for a JSON-RPC error answer: the answer as `error`, the raw response as `body`. */
  const v5Answer = (message: string) =>
    Object.assign(new Error("processing response error (code=SERVER_ERROR)"), {
      code: "SERVER_ERROR",
      error: Object.assign(new Error(message), { code: -32000 }),
      body: JSON.stringify({ jsonrpc: "2.0", id: 42, error: { code: -32000, message } }),
    });
  let emitter: MockEmitter;
  const alerts = (code: string) =>
    (emitter.emit as jest.Mock).mock.calls
      .filter(([event, payload]) => event === BotEvents.ALERT && payload?.code === code)
      .map(([, payload]) => payload);
  const handlerWith = (veaOutbox: any, veaOutboxProvider: any) =>
    new DummyHandler({
      chainId,
      network: Network.TESTNET,
      epoch: 42,
      veaInbox: {},
      veaOutbox,
      veaInboxProvider: {} as any,
      veaOutboxProvider,
      emitter,
      claim,
    });
  beforeEach(() => {
    resetUnminedSends();
    emitter = new MockEmitter();
    jest.spyOn(emitter, "emit");
  });

  it("v5: a stuck send re-broadcast to a primary that answers already known raises no TXN_REBROADCAST_FAILED, with the backup down, and does not fail over", async () => {
    const { raw, response } = await signedSend({ nonce: 7 });
    const v5: any = new FallbackProviderV5([PRIMARY, BACKUP], emitter);
    v5.inner[0] = {
      send: jest.fn(async (method: string) => {
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "eth_blockNumber") return "0x10";
        throw v5Answer("already known");
      }),
    };
    v5.inner[1] = { send: jest.fn(async () => Promise.reject(down())) };
    const outboxProvider = {
      getTransactionReceipt: jest.fn().mockResolvedValue(null),
      getBlock: jest.fn().mockResolvedValue({ number: 1000, timestamp: 1_700_000_000 }),
      getTransactionCount: jest.fn().mockResolvedValue(7),
      sendTransaction: (signed: string) => v5.sendTransaction(signed),
    };
    const veaOutbox = {
      runner: { address: TEST_SIGNER },
      startVerification: jest.fn().mockResolvedValueOnce(response),
    };
    const handler = handlerWith(veaOutbox, outboxProvider);
    await handler.startVerification(startTime);
    // Sent longer ago than MAX_PENDING_TIME, and not mined: stuck.
    handler.transactions.startVerificationTxn!.broadcastedTimestamp -= MAX_PENDING_TIME + 1;

    await handler.startVerification(startTime);

    expect(v5.inner[0].send).toHaveBeenCalledWith("eth_sendRawTransaction", [raw]);
    expect(v5.inner[1].send).not.toHaveBeenCalled();
    expect(v5.activeIndex).toBe(0);
    expect(alerts("TXN_REBROADCAST_FAILED")).toEqual([]);
    expect(alerts("NONCE_STUCK")).toHaveLength(1);
    expect(veaOutbox.startVerification).toHaveBeenCalledTimes(1);
  });

  it("v6: a send the primary took in a batch it failed over, answered already known by the backup, resolves and is recorded", async () => {
    const wallet = new Wallet("0x" + "22".repeat(32));
    const v6: any = new FallbackRpcProvider([PRIMARY, BACKUP], emitter, chainId);
    const signer = wallet.connect(v6);
    const request = {
      to: "0x00000000000000000000000000000000000000b0",
      data: "0xc0ffee",
      nonce: 7,
      gasLimit: BigInt(100_000),
      maxFeePerGas: BigInt(40_000_000_000),
      maxPriorityFeePerGas: BigInt(2_000_000_000),
      chainId,
      type: 2,
    };
    const raw = await wallet.signTransaction(request);
    const payloadsOf = (payload: any) => (Array.isArray(payload) ? payload : [payload]);
    // The primary takes the transaction but rate-limits the block number asked beside it.
    v6.inner[0] = {
      _send: jest.fn(async (payload: any) =>
        payloadsOf(payload).map(({ id, method }: any) =>
          method === "eth_sendRawTransaction"
            ? { id, result: keccak256(raw) }
            : { id, error: { code: -32005, message: "request rate limited" } }
        )
      ),
    };
    v6.inner[1] = {
      _send: jest.fn(async (payload: any) =>
        payloadsOf(payload).map(({ id, method }: any) =>
          method === "eth_sendRawTransaction"
            ? { id, error: { code: -32000, message: "already known" } }
            : { id, result: "0x10" }
        )
      ),
    };
    const veaOutbox = { runner: signer, startVerification: () => signer.sendTransaction(request) };
    const handler = handlerWith(veaOutbox, {});

    await handler.startVerification(startTime);

    expect(v6.inner[1]._send).toHaveBeenCalled();
    expect(handler.transactions.startVerificationTxn).toMatchObject({ hash: keccak256(raw), nonce: 7, raw });
  });
});
