import { ClaimStruct } from "../../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "ethers";
import { ArbToEthDevnetTransactionHandler, ArbToEthTransactionHandler } from "./arbToEthHandler";
import {
  ContractType,
  BaseTransactionHandlerConstructor,
  CannotFundError,
  MAX_PENDING_TIME,
  Transaction,
  resetUnminedSends,
} from "./baseTransactionHandler";
import { MockEmitter } from "../../utils/emitter";
import { BotEvents } from "../../utils/botEvents";
import { ClaimNotSetError } from "../../utils/errors";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { feesOf, signedSend, signedSendV5 } from "../../testUtils/signedSends";

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
  // Pin the clock: nothing here may depend on how fast the machine runs.
  beforeAll(() => jest.useFakeTimers({ now: 1_700_000_000_000, doNotFake: ["nextTick", "queueMicrotask"] }));
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    resetUnminedSends();
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

describe("ArbToEthTransactionHandler: challenge fees and stuck transactions", () => {
  const chainId = 11155111;
  const EPOCH = 100;
  const GWEI = BigInt(1_000_000_000);
  const GAS = BigInt(100_000);
  const ETH = BigInt(10) ** BigInt(18);
  const SIGNER = "0x00000000000000000000000000000000000000aa";
  const CHALLENGE = "challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))";
  const { deposit } = getBridgeConfig(chainId).routeConfig[Network.TESTNET];
  // Today's profit cap: about 1666.7 gwei for the 1 ETH Sepolia deposit.
  const profitCap = deposit / (GAS * BigInt(6));
  const claim: ClaimStruct = {
    stateRoot: "0x" + "66".repeat(32),
    claimer: "0x00000000000000000000000000000000000000c1",
    timestampClaimed: 1,
    timestampVerification: 0,
    blocknumberVerification: 0,
    honest: 0,
    challenger: ethers.ZeroAddress,
  };

  /**
   * The outbox chain as the v5 read provider serves it: latest 1000, finalized 930 (healthy),
   * no receipts, the signer's `latest` nonce at `latestNonce`, a node that takes every broadcast.
   */
  const chain = ({
    balance = BigInt(10) * ETH,
    baseFee = (BigInt(20) * GWEI) as bigint | null,
    latestNonce = 0,
  }: { balance?: bigint; baseFee?: bigint | null; latestNonce?: number } = {}) => ({
    getBalance: jest.fn().mockResolvedValue(BigNumber.from(balance.toString())),
    getBlock: jest.fn(async (tag: string | number) => {
      const n = tag === "latest" ? 1000 : tag === "finalized" ? 930 : Number(tag);
      return {
        number: n,
        timestamp: 1_700_000_000 - (1000 - n) * 12,
        baseFeePerGas: baseFee === null ? null : BigNumber.from(baseFee.toString()),
      };
    }),
    getFeeData: jest.fn().mockResolvedValue({
      maxFeePerGas: BigNumber.from((BigInt(30) * GWEI).toString()),
      maxPriorityFeePerGas: BigNumber.from(GWEI.toString()),
      gasPrice: BigNumber.from((BigInt(21) * GWEI).toString()),
    }),
    getTransactionCount: jest.fn().mockResolvedValue(latestNonce),
    getTransactionReceipt: jest.fn().mockResolvedValue(null),
    sendTransaction: jest.fn().mockResolvedValue({}),
  });
  /** Our earlier send, broadcast more than MAX_PENDING_TIME ago and never mined. */
  const expired = (fields: Partial<Transaction>): Transaction => ({
    hash: "0xstuck",
    broadcastedTimestamp: Date.now() - MAX_PENDING_TIME - 1,
    ...fields,
  });
  const contractFn = (result: any) => {
    const fn: any = jest.fn().mockResolvedValue(result);
    fn.estimateGas = jest.fn().mockResolvedValue(GAS);
    return fn;
  };

  let emitter: MockEmitter;
  let veaOutbox: any;
  let veaInbox: any;
  const build = (outboxProvider: any, inboxProvider: any = chain(), Handler = ArbToEthTransactionHandler) =>
    new Handler({
      chainId,
      network: Network.TESTNET,
      epoch: EPOCH,
      veaInbox,
      veaOutbox,
      veaInboxProvider: inboxProvider,
      veaOutboxProvider: outboxProvider,
      emitter,
      claim,
    });
  const eventsOf = (event: BotEvents) =>
    (emitter.emit as jest.Mock).mock.calls.filter(([e]) => e === event).map(([, payload]) => payload);

  beforeAll(() => jest.useFakeTimers({ now: 1_700_000_000_000, doNotFake: ["nextTick", "queueMicrotask"] }));
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    resetUnminedSends();
    emitter = new MockEmitter();
    jest.spyOn(emitter, "emit");
    veaOutbox = {
      runner: { address: SIGNER },
      [CHALLENGE]: contractFn({ hash: "0xchallenge" }),
      ["claim(uint256,bytes32)"]: contractFn({ hash: "0xclaim" }),
      claim: jest.fn().mockResolvedValue({ hash: "0xclaim" }),
      devnetAdvanceState: jest.fn().mockResolvedValue({ hash: "0xadvance" }),
    };
    veaInbox = { sendSnapshot: jest.fn().mockResolvedValue({ hash: "0xsent" }) };
  });

  describe("the challenge fee cap", () => {
    it("challenges at a fee cap lowered to the balance when it holds the deposit but not the gas at the profit cap", async () => {
      // 1.1 ETH: the deposit plus 1000 gwei of gas per unit, short of the ~1.1667 ETH the profit cap needs.
      const handler = build(chain({ balance: deposit + GAS * BigInt(1000) * GWEI }));
      await handler.challengeClaim();
      expect(veaOutbox[CHALLENGE]).toHaveBeenCalledWith(EPOCH, claim, {
        maxFeePerGas: BigInt(1000) * GWEI,
        maxPriorityFeePerGas: BigInt(1000) * GWEI,
        value: deposit,
        gasLimit: GAS,
      });
      expect(eventsOf(BotEvents.CANNOT_FUND)).toEqual([]);
      expect(handler.transactions.challengeTxn).toMatchObject({ hash: "0xchallenge" });
    });

    it("keeps the profit cap when the balance covers it", async () => {
      const handler = build(chain());
      await handler.challengeClaim();
      expect(veaOutbox[CHALLENGE]).toHaveBeenCalledWith(EPOCH, claim, {
        maxFeePerGas: profitCap,
        maxPriorityFeePerGas: profitCap,
        value: deposit,
        gasLimit: GAS,
      });
    });

    it("still raises CANNOT_FUND when the balance cannot pay the gas at the chain's base fee", async () => {
      const balance = deposit + GAS * BigInt(20) * GWEI - BigInt(1);
      const handler = build(chain({ balance }));
      await expect(handler.challengeClaim()).rejects.toThrow(CannotFundError);
      expect(veaOutbox[CHALLENGE]).not.toHaveBeenCalled();
      expect(eventsOf(BotEvents.CANNOT_FUND)).toEqual([
        {
          chainId,
          network: Network.TESTNET,
          epoch: EPOCH,
          action: "challenge",
          required: (deposit + GAS * BigInt(20) * GWEI).toString(),
          available: balance.toString(),
        },
      ]);
    });

    it("a profit cap below the base fee is no funding shortfall: the challenge goes out at the profit cap", async () => {
      const handler = build(chain({ baseFee: BigInt(2000) * GWEI }));
      await handler.challengeClaim();
      expect(veaOutbox[CHALLENGE]).toHaveBeenCalledWith(
        EPOCH,
        claim,
        expect.objectContaining({ maxFeePerGas: profitCap, value: deposit })
      );
      expect(eventsOf(BotEvents.CANNOT_FUND)).toEqual([]);
    });

    it("takes the fee data's gas price as the base fee on a chain without one", async () => {
      const balance = deposit + GAS * BigInt(21) * GWEI - BigInt(1);
      const handler = build(chain({ balance, baseFee: null }));
      await expect(handler.challengeClaim()).rejects.toThrow(CannotFundError);
      expect(eventsOf(BotEvents.CANNOT_FUND)).toEqual([
        expect.objectContaining({ required: (deposit + GAS * BigInt(21) * GWEI).toString() }),
      ]);
    });
  });

  describe("an EXPIRED transaction is re-broadcast unchanged, never replaced", () => {
    let start: number;
    beforeEach(() => (start = Date.now()));
    afterEach(() => jest.setSystemTime(start));
    const laterThanPendingTime = () => jest.setSystemTime(Date.now() + MAX_PENDING_TIME + 1);
    const nonceStuck = () => eventsOf(BotEvents.ALERT).filter((alert) => alert.code === "NONCE_STUCK");

    it("a stuck challenge is re-broadcast at the fees it was signed with, never outbid above the profit cap", async () => {
      const outbox = chain({ latestNonce: 3 });
      const { raw, response } = await signedSend({
        nonce: 3,
        value: deposit,
        gasLimit: GAS,
        maxFeePerGas: profitCap,
        maxPriorityFeePerGas: profitCap,
      });
      veaOutbox[CHALLENGE].mockResolvedValueOnce(response);
      const handler = build(outbox);
      await handler.challengeClaim();
      laterThanPendingTime();
      await handler.challengeClaim();
      expect(veaOutbox[CHALLENGE]).toHaveBeenCalledTimes(1);
      expect(outbox.sendTransaction.mock.calls).toEqual([[raw]]);
      expect(feesOf(raw)).toMatchObject({ nonce: 3, maxFeePerGas: profitCap, maxPriorityFeePerGas: profitCap });
      expect(nonceStuck()).toEqual([
        expect.objectContaining({
          details: expect.objectContaining({ hash: response.hash, nonce: 3, maxFeePerGas: profitCap.toString() }),
        }),
      ]);
      expect(eventsOf(BotEvents.CANNOT_FUND)).toEqual([]);
    });

    it("a stuck challenge whose nonce was used is sent fresh", async () => {
      const handler = build(chain({ latestNonce: 4 }));
      handler.transactions.challengeTxn = expired({
        nonce: 3,
        maxFeePerGas: profitCap,
        maxPriorityFeePerGas: profitCap,
      });
      await handler.challengeClaim();
      expect(veaOutbox[CHALLENGE]).toHaveBeenCalledWith(EPOCH, claim, {
        maxFeePerGas: profitCap,
        maxPriorityFeePerGas: profitCap,
        value: deposit,
        gasLimit: GAS,
      });
      expect(veaOutbox[CHALLENGE].mock.calls[0][2].nonce).toBeUndefined();
    });

    it("a stuck claim waits on its nonce: no second claim, at any fee", async () => {
      const handler = build(chain({ latestNonce: 9 }));
      handler.transactions.claimTxn = expired({
        nonce: 9,
        maxFeePerGas: BigInt(40) * GWEI,
        maxPriorityFeePerGas: BigInt(2) * GWEI,
      });
      await handler.makeClaim(claim.stateRoot as string);
      expect(veaOutbox.claim).not.toHaveBeenCalled();
      expect(nonceStuck()).toEqual([
        expect.objectContaining({ details: expect.objectContaining({ hash: "0xstuck", nonce: 9 }) }),
      ]);
    });

    it("a stuck sendSnapshot waits on the inbox chain's nonce", async () => {
      const inbox = chain({ latestNonce: 2 });
      const handler = build(chain({ latestNonce: 50 }), inbox);
      handler.transactions.sendSnapshotTxn = expired({ nonce: 2, maxFeePerGas: GWEI, maxPriorityFeePerGas: GWEI });
      await handler.sendSnapshot();
      expect(veaInbox.sendSnapshot).not.toHaveBeenCalled();
      expect(inbox.getTransactionCount).toHaveBeenCalledWith(SIGNER, "latest");
    });

    it("a stuck execution, as ethers v5 reports it, is re-broadcast from its r, s and v, and executed again only once its nonce is used without it", async () => {
      const outbox = chain({ latestNonce: 4 });
      const inbox = chain();
      const handler = build(outbox, inbox);
      const { raw, response } = await signedSendV5({ nonce: 4 });
      const execFn = jest.fn().mockResolvedValueOnce(response).mockResolvedValue({ hash: "0xexec2" });
      await handler.resolveChallengedClaim("0xsent", execFn);
      // Its BigNumber fees are kept as bigint, with its signed bytes.
      expect(handler.transactions.executeSnapshotTxn).toMatchObject({
        hash: response.hash,
        nonce: 4,
        maxFeePerGas: BigInt(40) * GWEI,
        maxPriorityFeePerGas: BigInt(2) * GWEI,
        raw,
      });
      laterThanPendingTime();
      await handler.resolveChallengedClaim("0xsent", execFn);
      expect(execFn).toHaveBeenCalledTimes(1);
      expect(outbox.sendTransaction.mock.calls).toEqual([[raw]]);
      laterThanPendingTime();
      outbox.getTransactionCount.mockResolvedValue(5);
      await handler.resolveChallengedClaim("0xsent", execFn);
      // A first execution, and one after its nonce was taken: each priced by the Arbitrum SDK, no overrides.
      expect(execFn.mock.calls).toEqual([
        ["0xsent", inbox, outbox],
        ["0xsent", inbox, outbox],
      ]);
    });

    it("a stuck devnetAdvanceState waits on its nonce", async () => {
      const handler = build(
        chain({ latestNonce: 5 }),
        chain(),
        ArbToEthDevnetTransactionHandler
      ) as ArbToEthDevnetTransactionHandler;
      handler.transactions.devnetAdvanceStateTxn = expired({
        nonce: 5,
        maxFeePerGas: GWEI,
        maxPriorityFeePerGas: GWEI,
      });
      await handler.devnetAdvanceState(claim.stateRoot as string);
      expect(veaOutbox.devnetAdvanceState).not.toHaveBeenCalled();
    });
  });

  it("our claim of another epoch left unmined is re-broadcast unchanged by the challenge, which goes out fresh behind it at the profit cap", async () => {
    // checkAndClaim calls makeClaim only while its epoch is the claimable one: nothing looks at
    // that claim afterwards, and every later outbox send of ours would queue behind it.
    const start = Date.now();
    try {
      const outbox = chain({ latestNonce: 3 });
      const { raw, response } = await signedSend({ nonce: 3, value: deposit, gasLimit: GAS });
      veaOutbox.claim.mockResolvedValueOnce(response);
      await build(outbox).makeClaim(claim.stateRoot as string);
      jest.setSystemTime(start + 2 * 3600 * 1000);
      const challenger = build(outbox);
      challenger.epoch = EPOCH + 1;
      await challenger.challengeClaim();
      expect(outbox.sendTransaction.mock.calls).toEqual([[raw]]);
      expect(veaOutbox[CHALLENGE]).toHaveBeenCalledWith(EPOCH + 1, claim, {
        maxFeePerGas: profitCap,
        maxPriorityFeePerGas: profitCap,
        value: deposit,
        gasLimit: GAS,
      });
      expect(eventsOf(BotEvents.ALERT)).toEqual([
        expect.objectContaining({
          code: "NONCE_STUCK",
          epoch: EPOCH,
          details: expect.objectContaining({ hash: response.hash, nonce: 3, contract: ContractType.OUTBOX }),
        }),
      ]);
    } finally {
      jest.setSystemTime(start);
    }
  });

  describe("the challenge is funded from what our other pooled sends leave", () => {
    /** Our claim of another epoch, still pooled at nonce 3: up to 1 ETH + 100k gas at 40 gwei. */
    const pooledClaim = async (outbox: any) => {
      veaOutbox.claim.mockResolvedValueOnce({
        hash: "0xpooled",
        nonce: 3,
        maxFeePerGas: BigInt(40) * GWEI,
        maxPriorityFeePerGas: BigInt(2) * GWEI,
        to: "0x00000000000000000000000000000000000000b0",
        data: "0xc1a1",
        value: deposit,
        gasLimit: GAS,
      });
      const claimer = build(outbox);
      claimer.epoch = EPOCH + 1;
      await claimer.makeClaim(claim.stateRoot as string);
    };
    const pooledCost = deposit + GAS * BigInt(40) * GWEI;

    it("lowers the fee cap to what the balance less the pooled claim pays", async () => {
      // Without the pooled claim the balance would pay the profit cap.
      const outbox = chain({ balance: pooledCost + deposit + GAS * BigInt(1000) * GWEI, latestNonce: 3 });
      await pooledClaim(outbox);
      await build(outbox).challengeClaim();
      expect(veaOutbox[CHALLENGE]).toHaveBeenCalledWith(EPOCH, claim, {
        maxFeePerGas: BigInt(1000) * GWEI,
        maxPriorityFeePerGas: BigInt(1000) * GWEI,
        value: deposit,
        gasLimit: GAS,
      });
    });

    it("raises CANNOT_FUND when that leaves too little for the base fee, instead of a send the node refuses", async () => {
      const balance = pooledCost + deposit;
      const outbox = chain({ balance, latestNonce: 3 });
      await pooledClaim(outbox);
      await expect(build(outbox).challengeClaim()).rejects.toThrow(CannotFundError);
      expect(veaOutbox[CHALLENGE]).not.toHaveBeenCalled();
      expect(eventsOf(BotEvents.CANNOT_FUND)).toEqual([
        expect.objectContaining({ action: "challenge", available: (balance - pooledCost).toString() }),
      ]);
    });

    it("a mined claim no longer counts", async () => {
      const outbox = chain({ balance: deposit + GAS * BigInt(1000) * GWEI, latestNonce: 3 });
      await pooledClaim(outbox);
      outbox.getTransactionCount.mockResolvedValue(4);
      await build(outbox).challengeClaim();
      expect(veaOutbox[CHALLENGE]).toHaveBeenCalledWith(
        EPOCH,
        claim,
        expect.objectContaining({ maxFeePerGas: BigInt(1000) * GWEI })
      );
    });

    it("a node's INSUFFICIENT_FUNDS refusal of the challenge raises CANNOT_FUND", async () => {
      const outbox = chain();
      veaOutbox[CHALLENGE].mockRejectedValueOnce(
        Object.assign(new Error("insufficient funds for gas * price + value"), { code: "INSUFFICIENT_FUNDS" })
      );
      await expect(build(outbox).challengeClaim()).rejects.toThrow(CannotFundError);
      expect(eventsOf(BotEvents.CANNOT_FUND)).toEqual([
        {
          chainId,
          network: Network.TESTNET,
          epoch: EPOCH,
          action: "challenge",
          required: (deposit + GAS * profitCap).toString(),
          available: (BigInt(10) * ETH).toString(),
        },
      ]);
    });
  });

  it("a reverted sendSnapshot is sent again while the inbox chain's finality has stalled", async () => {
    // Confirmed at Arbitrum's latest, its finalized block stopped far below: the inbox read block
    // has no stall bound, and a revert changed nothing for it to catch up with.
    const inbox = {
      ...chain(),
      getBlock: jest.fn(async (tag: string | number) => {
        const n = tag === "latest" ? 1000 : tag === "finalized" ? 100 : Number(tag);
        return { number: n, timestamp: 1_700_000_000 - (1000 - n) };
      }),
      getTransactionReceipt: jest.fn().mockResolvedValue({ blockNumber: 980, status: 0 }),
    };
    const handler = build(chain(), inbox);
    handler.transactions.sendSnapshotTxn = { hash: "0xreverted", broadcastedTimestamp: Date.now() - 60_000 };
    await handler.sendSnapshot();
    expect(veaInbox.sendSnapshot).toHaveBeenCalledTimes(1);
  });

  it("a mined claim is not sent again while it is above the outbox read block", async () => {
    // 50 confirmations of latest (1000), but above the finalized block (930) the outbox is read at.
    const outbox = chain();
    outbox.getTransactionReceipt.mockResolvedValue({ blockNumber: 950 });
    const handler = build(outbox);
    handler.transactions.claimTxn = { hash: "0xclaimed", broadcastedTimestamp: Date.now() - 60_000 };
    await handler.makeClaim(claim.stateRoot as string);
    expect(veaOutbox["claim(uint256,bytes32)"].estimateGas).not.toHaveBeenCalled();
    expect(veaOutbox.claim).not.toHaveBeenCalled();
  });
});
