import { EventEmitter } from "events";
import { ethers } from "ethers";
import { ClaimStruct } from "../../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import {
  getClaim,
  getClaimResolveState,
  hashClaim,
  verifyClaimHash,
  createClaimResolveCache,
  ClaimHonestState,
} from "../../utils/claim";
import { getOutboxReadBlock } from "../../utils/arbToEthState";
import { DEFAULT_CHUNK_SIZE } from "../../utils/logScanner";
import { BotEvents } from "../../utils/botEvents";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import {
  createFakeChain,
  createTwoChainRoute,
  FakeChain,
  TwoChainRoute,
  WrongChainBlockError,
} from "../../testUtils/twoChainFixture";

// Lets a test replace the outbox read block (e.g. decision [O4]'s latest - 64 during a stall)
// while every other test reads through the real `getOutboxReadBlock`.
const mockReadBlock: { override?: (params: any) => Promise<{ number: number; timestamp: number }> } = {};
jest.mock("../../utils/arbToEthState", () => {
  const actual = jest.requireActual("../../utils/arbToEthState");
  return {
    ...actual,
    getOutboxReadBlock: jest.fn((params: any) =>
      mockReadBlock.override ? mockReadBlock.override(params) : actual.getOutboxReadBlock(params)
    ),
  };
});

const CHAIN_ID = 10200;
const NETWORK = Network.TESTNET;
const routeConfig = getBridgeConfig(CHAIN_ID).routeConfig[NETWORK];
const EPOCH_PERIOD = routeConfig.epochPeriod;
const gnosisInboxInterface = new ethers.Interface(routeConfig.veaInbox.abi);
const ethInboxInterface = new ethers.Interface(getBridgeConfig(11155111).routeConfig[NETWORK].veaInbox.abi);

const CLAIMER = "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288";
const CHALLENGER = "0x1111111111111111111111111111111111111111";
const STATE_ROOT = "0xeac817ed5c5b3d1c2c548f231b7cf9a0dfd174059f450ec6f0805acf6a16a551";
const WRONG_ROOT = "0x" + "ab".repeat(32);

// Keeps the address case, as the reconstruction copies it from the topic.
const topicOf = (address: string) => "0x" + "0".repeat(24) + address.slice(2);
const encodeEpoch = (epoch: number) => ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [epoch]);
const txHashOf = (label: string) => ethers.id(label);

const INBOX = "0x00000000000000000000000000000000000000a0";
const ARB_SYS = "0x0000000000000000000000000000000000000064";
const CLAIM_TUPLE =
  "(bytes32 stateRoot, address claimer, uint32 timestampClaimed, uint32 timestampVerification, uint32 blocknumberVerification, uint8 honest, address challenger)";
const arbSysInterface = new ethers.Interface([
  "event L2ToL1Tx(address caller, address indexed destination, uint256 indexed hash, uint256 indexed position, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, bytes data)",
]);
const routerInterface = new ethers.Interface([
  `function route(uint256 _epoch, bytes32 _stateRoot, uint256 _gasLimit, ${CLAIM_TUPLE} _claim)`,
]);
const ethOutboxInterface = new ethers.Interface([
  `function resolveDisputedClaim(uint256 _epoch, bytes32 _stateRoot, ${CLAIM_TUPLE} _claim)`,
]);

/**
 * The ArbSys `L2ToL1Tx` log of a `sendSnapshot`: the inbox forwards `route(...)` to the router on
 * 10200 and `resolveDisputedClaim(...)` to the outbox on 11155111.
 */
const l2ToL1TxLog = ({
  chainId = CHAIN_ID,
  epoch,
  claim,
  gasLimit = 3_000_000,
  caller = INBOX,
  address = ARB_SYS,
}: {
  chainId?: number;
  epoch: number;
  claim: ClaimStruct;
  gasLimit?: number;
  caller?: string;
  address?: string;
}) => {
  const forwarded =
    chainId === 10200
      ? routerInterface.encodeFunctionData("route", [epoch, STATE_ROOT, gasLimit, claim])
      : ethOutboxInterface.encodeFunctionData("resolveDisputedClaim", [epoch, STATE_ROOT, claim]);
  const log = arbSysInterface.encodeEventLog("L2ToL1Tx", [
    caller,
    "0x00000000000000000000000000000000000000c0",
    1,
    1,
    0,
    0,
    0,
    0,
    forwarded,
  ]);
  return { address, topics: log.topics, data: log.data };
};

/** The block of `chain` whose timestamp is the last one at or before `timestamp`. */
const blockAt = (chain: FakeChain, timestamp: number): number => {
  const head = chain.block("latest");
  return head.number - Math.ceil((head.timestamp - timestamp) / chain.options.secondsPerBlock);
};

class RecordingEmitter extends EventEmitter {
  events: Array<{ event: string; args: any[] }> = [];
  emit(event: string | symbol, ...args: any[]): boolean {
    this.events.push({ event: String(event), args });
    return true;
  }
  of(event: BotEvents) {
    return this.events.filter((e) => e.event === event).map((e) => e.args[0]);
  }
}

interface FakeLog {
  event: string;
  epoch?: number;
  blockNumber: number;
  index: number;
  transactionHash: string;
  data: string;
  topics: string[];
}

/**
 * A contract on one chain of the fixture. Every log range and every pinned read must use a
 * block of that chain, or the fixture throws `WrongChainBlockError`.
 */
const fakeContract = (chain: FakeChain, address: string) => {
  const logs: FakeLog[] = [];
  const queries: Array<{ event: string; from: number; to: number }> = [];
  // Claim hash history: [fromBlock, hash], applied in order.
  const hashHistory: Array<[number, string]> = [];
  const filter =
    (event: string, epochArg: number) =>
    (...args: any[]) => ({ event, epoch: args[epochArg] ?? undefined });
  return {
    logs,
    queries,
    hashHistory,
    claimHashReads: [] as number[],
    getAddress: async () => address,
    filters: {
      Claimed: filter("Claimed", 1),
      Challenged: filter("Challenged", 0),
      VerificationStarted: filter("VerificationStarted", 0),
      FailedResolution: filter("FailedResolution", 99),
      SnapshotSent: filter("SnapshotSent", 0),
    },
    queryFilter: jest.fn(async (f: { event: string; epoch?: number }, from: number, to: number) => {
      chain.assertOwnBlock(from);
      chain.assertOwnBlock(to);
      queries.push({ event: f.event, from, to });
      return logs.filter(
        (log) =>
          log.event === f.event &&
          log.blockNumber >= from &&
          log.blockNumber <= to &&
          (f.epoch === undefined || f.epoch === null || log.epoch === f.epoch)
      );
    }),
  };
};

const makeOutbox = (chain: FakeChain) => {
  const contract = fakeContract(chain, "0x00000000000000000000000000000000000000b0");
  return Object.assign(contract, {
    claimHashes: chain.pinned((blockNumber: number | "latest", _epoch: number) => {
      const n = blockNumber === "latest" ? chain.resolve("latest") : blockNumber;
      contract.claimHashReads.push(n);
      let hash = ethers.ZeroHash;
      for (const [from, h] of contract.hashHistory) if (n >= from) hash = h;
      return hash;
    }),
  });
};

const baseClaim = (overrides: Partial<ClaimStruct> = {}): ClaimStruct => ({
  stateRoot: STATE_ROOT,
  claimer: CLAIMER,
  timestampClaimed: 0,
  timestampVerification: 0,
  blocknumberVerification: 0,
  honest: ClaimHonestState.NONE,
  challenger: ethers.ZeroAddress,
  ...overrides,
});

describe("claims lane (two-chain route, chain 10200)", () => {
  let route: TwoChainRoute;
  let emitter: RecordingEmitter;
  const currentEpoch = () => Math.floor(route.outbox.block("latest").timestamp / EPOCH_PERIOD);

  beforeEach(() => {
    route = createTwoChainRoute();
    emitter = new RecordingEmitter();
    mockReadBlock.override = undefined;
    (getOutboxReadBlock as jest.Mock).mockClear();
  });

  /** An outbox with a claim for `epoch` made half-way through its claim window. */
  const claimedOutbox = (chain: FakeChain, epoch: number) => {
    const veaOutbox = makeOutbox(chain);
    const claimedBlock = blockAt(chain, (epoch + 1) * EPOCH_PERIOD + EPOCH_PERIOD / 2);
    const claim = baseClaim({ timestampClaimed: chain.block(claimedBlock).timestamp });
    veaOutbox.logs.push({
      event: "Claimed",
      epoch,
      blockNumber: claimedBlock,
      index: 0,
      transactionHash: txHashOf("claim"),
      data: STATE_ROOT,
      topics: [ethers.id("Claimed(address,uint256,bytes32)"), topicOf(CLAIMER), encodeEpoch(epoch)],
    });
    veaOutbox.hashHistory.push([claimedBlock, hashClaim(claim)]);
    return { veaOutbox, claim, claimedBlock };
  };

  const claimParams = (veaOutbox: any, epoch: number, extra: Record<string, any> = {}) => ({
    network: NETWORK,
    chainId: CHAIN_ID,
    veaOutbox,
    veaOutboxProvider: route.outbox.provider,
    epoch,
    epochPeriod: EPOCH_PERIOD,
    emitter: emitter as any,
    fetchClaimForEpoch: jest.fn(async () => undefined),
    ...extra,
  });

  describe("PRD 1.1 / [O4]: outbox head reads go through getOutboxReadBlock", () => {
    it("getClaim reads claimHashes at the outbox read block of the outbox provider", async () => {
      const epoch = currentEpoch() - 3;
      const { veaOutbox, claim } = claimedOutbox(route.outbox, epoch);

      const result = await getClaim(claimParams(veaOutbox, epoch) as any);

      expect(result).toEqual(claim);
      expect(getOutboxReadBlock).toHaveBeenCalledWith(
        expect.objectContaining({ outboxProvider: route.outbox.provider })
      );
      expect(veaOutbox.claimHashReads).toEqual([route.outbox.resolve("finalized")]);
    });

    it("getClaim finds a claim made past a stalled finalized block when the read block is latest - 64", async () => {
      // Finality stalled for ~3 hours on the outbox chain: `finalized` trails latest by 2000 blocks.
      const stalled = createFakeChain({ ...route.outbox.options, finalizedLag: 2000 });
      const epoch = Math.floor(stalled.block("latest").timestamp / EPOCH_PERIOD) - 2;
      const { veaOutbox, claim, claimedBlock } = claimedOutbox(stalled, epoch);
      expect(claimedBlock).toBeGreaterThan(stalled.resolve("finalized") + 256);
      const readBlock = stalled.block(stalled.resolve("latest") - 64);
      mockReadBlock.override = async () => ({ number: readBlock.number, timestamp: readBlock.timestamp });

      const result = await getClaim({ ...claimParams(veaOutbox, epoch), veaOutboxProvider: stalled.provider } as any);

      expect(result).toEqual(claim);
      expect(veaOutbox.claimHashReads).toEqual([readBlock.number]);
      for (const q of veaOutbox.queries) expect(q.to).toBeLessThanOrEqual(readBlock.number);
    });

    it("getClaimResolveState reads claimHashes at the outbox read block, not at the inbox head tag", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      const readBlock = route.outbox.block(route.outbox.resolve("latest") - 64);
      mockReadBlock.override = async () => ({ number: readBlock.number, timestamp: readBlock.timestamp });

      await getClaimResolveState(env.params);

      expect(getOutboxReadBlock).toHaveBeenCalledWith(
        expect.objectContaining({ outboxProvider: route.outbox.provider })
      );
      expect(env.veaOutbox.claimHashReads).toEqual([readBlock.number]);
    });
  });

  /**
   * A dispute for `epoch`: the claim is challenged on the outbox, and a snapshot is sent on
   * Arbitrum Sepolia. Each send's receipt carries the ArbSys `L2ToL1Tx` the inbox emits, built by
   * `l2ToL1TxLog`; `logs` replaces it to model wrapper transactions and forged messages.
   */
  const resolveEnv = (
    epoch: number,
    {
      sentAt,
      sentClaim,
      claimNow,
      chainId = CHAIN_ID,
    }: { sentAt?: number; sentClaim?: ClaimStruct; claimNow?: ClaimStruct; chainId?: number }
  ) => {
    const claim =
      claimNow ??
      baseClaim({
        timestampClaimed: (epoch + 1) * EPOCH_PERIOD + 600,
        challenger: CHALLENGER,
      });
    const veaOutbox = makeOutbox(route.outbox);
    veaOutbox.hashHistory.push([route.outbox.options.firstBlock, hashClaim(claim)]);

    const veaInbox = Object.assign(fakeContract(route.inbox, INBOX), {
      interface: chainId === 10200 ? gnosisInboxInterface : ethInboxInterface,
    });
    const receipts: Record<string, { blockNumber: number; logs: any[] } | null> = {};
    const sendSnapshot = (
      timestamp: number,
      label: string,
      claimSent: ClaimStruct,
      { logs, gasLimit, index = 0 }: { logs?: any[]; gasLimit?: number; index?: number } = {}
    ) => {
      const blockNumber = blockAt(route.inbox, timestamp);
      const transactionHash = txHashOf(label);
      receipts[transactionHash] = {
        blockNumber,
        logs: logs ?? [l2ToL1TxLog({ chainId, epoch, claim: claimSent, gasLimit })],
      };
      veaInbox.logs.push({
        event: "SnapshotSent",
        epoch,
        blockNumber,
        index,
        transactionHash,
        data: ethers.ZeroHash,
        topics: [],
      });
      return { blockNumber, transactionHash };
    };
    const sent = sentAt === undefined ? null : sendSnapshot(sentAt, "send-1", sentClaim ?? claim);
    const veaInboxProvider = {
      ...route.inbox.provider,
      getTransaction: jest.fn(async () => {
        throw new Error("the outer transaction is never trusted");
      }),
      getTransactionReceipt: jest.fn(async (hash: string) => receipts[hash] ?? null),
    };
    const fetchMessageStatus = jest.fn(async (_hash: string, _child: any, _parent: any) => 1);
    const params: any = {
      chainId,
      network: NETWORK,
      veaInbox,
      veaInboxProvider,
      veaOutbox,
      veaOutboxProvider: route.outbox.provider,
      l1Provider: route.router.provider,
      epoch,
      epochPeriod: EPOCH_PERIOD,
      emitter,
      fetchMessageStatus,
      fetchSnapshotSentFromGraph: jest.fn(async () => undefined),
      cache: createClaimResolveCache(),
    };
    const failResolution = (timestamp: number, forEpoch: number, label: string) => {
      const blockNumber = blockAt(route.outbox, timestamp);
      veaOutbox.logs.push({
        event: "FailedResolution",
        blockNumber,
        index: 0,
        transactionHash: txHashOf(label),
        data: encodeEpoch(forEpoch),
        topics: [ethers.id("FailedResolution(uint256)")],
      });
      return { blockNumber, transactionHash: txHashOf(label) };
    };
    return {
      params,
      veaOutbox,
      veaInbox,
      veaInboxProvider,
      claim,
      sent: sent!,
      receipts,
      sendSnapshot,
      failResolution,
      fetchMessageStatus,
    };
  };

  describe("PRD 1.3 (BR-5): getClaimResolveState pins each read to its own chain", () => {
    it("pins claimHashes to a Chiado block and asks the Sepolia provider for the message status", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });

      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot).toEqual({ status: true, txHash: env.sent.transactionHash });
      expect(state.execution.status).toBe(1);
      expect(env.veaOutbox.claimHashReads).toEqual([route.outbox.resolve("finalized")]);
      for (const n of env.veaOutbox.claimHashReads) expect(() => route.outbox.assertOwnBlock(n)).not.toThrow();
      for (const q of env.veaInbox.queries) expect(() => route.inbox.assertOwnBlock(q.from)).not.toThrow();
      expect(env.fetchMessageStatus).toHaveBeenCalledTimes(1);
      const [, child, parent] = env.fetchMessageStatus.mock.calls[0];
      expect(child).toBe(env.params.veaInboxProvider);
      expect(parent).toBe(route.router.provider);
    });

    it("fails loudly, instead of reading a wrong hash, when given the router provider as the outbox provider", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });

      await expect(
        getClaimResolveState({ ...env.params, veaOutboxProvider: route.router.provider })
      ).rejects.toBeInstanceOf(WrongChainBlockError);
    });
  });

  describe("#1 (BR-10): a ticket is adopted only by the first L2ToL1Tx of its receipt", () => {
    it("adopts a third-party 10200 route(...) ticket carrying the current claim at gasLimit 3,000,000", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });

      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot).toEqual({ status: true, txHash: env.sent.transactionHash });
      expect(env.veaInboxProvider.getTransaction).not.toHaveBeenCalled();
    });

    it("does not adopt a ticket carrying a different claim", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {
        sentAt: (epoch + 1) * EPOCH_PERIOD + 1800,
        sentClaim: baseClaim({ stateRoot: WRONG_ROOT, challenger: CHALLENGER }),
      });

      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot.status).toBe(false);
      expect(env.fetchMessageStatus).not.toHaveBeenCalled();
    });

    it("[L16] does not adopt a wrapper whose first message is wrong and second correct; returns the later correct ticket", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      const wrong = baseClaim({ stateRoot: WRONG_ROOT, challenger: CHALLENGER });
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1200, "wrapper", env.claim, {
        logs: [l2ToL1TxLog({ epoch, claim: wrong }), l2ToL1TxLog({ epoch, claim: env.claim })],
      });
      const correct = env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1800, "correct", env.claim);

      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot).toEqual({ status: true, txHash: correct.transactionHash });
    });

    it.each([
      ["a caller other than the inbox", { caller: "0x000000000000000000000000000000000000beef" }],
      ["an emitter other than ArbSys", { address: "0x000000000000000000000000000000000000beef" }],
    ])("[L16] does not adopt a message from %s", async (_label, forged) => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1800, "forged", env.claim, {
        logs: [l2ToL1TxLog({ epoch, claim: env.claim, ...forged })],
      });

      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot.status).toBe(false);
      expect(env.fetchMessageStatus).not.toHaveBeenCalled();
    });

    it("[L16] a forged L2ToL1Tx-shaped log before ArbSys's makes the ticket invalid (the SDK executes the first)", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1800, "forged-first", env.claim, {
        logs: [
          l2ToL1TxLog({ epoch, claim: env.claim, address: "0x000000000000000000000000000000000000beef" }),
          l2ToL1TxLog({ epoch, claim: env.claim }),
        ],
      });

      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);
    });

    it("does not adopt a receipt without any L2ToL1Tx", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1800, "no-message", env.claim, { logs: [] });

      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);
    });

    it.each([[10200], [11155111]])(
      "[L24] (a) chain %s: a first message for E-1 carrying E's struct is not adopted; the later E ticket is",
      async (chainId) => {
        const epoch = currentEpoch() - 3;
        const env = resolveEnv(epoch, { chainId });
        env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1200, "previous-epoch", env.claim, {
          logs: [l2ToL1TxLog({ chainId, epoch: epoch - 1, claim: env.claim })],
        });
        const correct = env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1800, "correct", env.claim);

        const state = await getClaimResolveState(env.params);

        expect(state.sendSnapshot).toEqual({ status: true, txHash: correct.transactionHash });
      }
    );

    it("[L23] on 10200 an earlier ticket at gasLimit 100,000 is skipped for a later one at 3,000,000", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1200, "low-gas", env.claim, { gasLimit: 100_000 });
      const enough = env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1800, "enough-gas", env.claim, {
        gasLimit: 3_000_000,
      });

      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot).toEqual({ status: true, txHash: enough.transactionHash });
    });

    it("[L20] returns the earliest adopted ticket: an older executable one over a newer unexecuted one", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      // The newer one is in the same block, at a lower log index than the older one would sort after.
      const older = env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1200, "older", env.claim, { index: 3 });
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1200, "newer", env.claim, { index: 7 });
      env.fetchMessageStatus.mockImplementation(async (hash: string) => (hash === older.transactionHash ? 1 : 0));

      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot).toEqual({ status: true, txHash: older.transactionHash });
      expect(state.execution.status).toBe(1);
      expect(state.failedResolution).toBeUndefined();
    });

    it("[L28] (b) adopts a ticket above the inbox finalized block even with headBlockTag 'finalized'", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      const fresh = env.sendSnapshot(route.inbox.block("latest").timestamp - 60, "fresh", env.claim);
      expect(fresh.blockNumber).toBeGreaterThan(route.inbox.resolve("finalized"));

      const state = await getClaimResolveState({ ...env.params, headBlockTag: "finalized" });

      expect(state.sendSnapshot).toEqual({ status: true, txHash: fresh.transactionHash });
    });

    it("[L28] (d) a null receipt is not cached: unknown on cycle 1, adopted on cycle 2", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      const receipt = env.receipts[env.sent.transactionHash];
      env.receipts[env.sent.transactionHash] = null;

      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);
      env.receipts[env.sent.transactionHash] = receipt;
      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot).toEqual({ status: true, txHash: env.sent.transactionHash });
      expect(env.veaInboxProvider.getTransactionReceipt).toHaveBeenCalledTimes(2);
    });

    it("[L24] (b) one cache across two calls: adoption flips with claimHashes without a second receipt fetch", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(true);

      // Verification started on the outbox: the claim struct changed, the sent one is stale.
      const changed = { ...env.claim, timestampVerification: 1, blocknumberVerification: 2 };
      route.outbox.advance(10);
      env.veaOutbox.hashHistory.push([route.outbox.resolve("latest") - 5, hashClaim(changed)]);
      mockReadBlock.override = async () => route.outbox.block("latest");
      const second = await getClaimResolveState(env.params);

      expect(second.sendSnapshot.status).toBe(false);
      expect(env.veaInboxProvider.getTransactionReceipt).toHaveBeenCalledTimes(1);
    });

    it("[L16] 1,000 spam sends over two cycles fetch each receipt once", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      const wrong = baseClaim({ stateRoot: WRONG_ROOT, challenger: CHALLENGER });
      for (let i = 0; i < 1000; i++) {
        env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 600 + Math.floor(i / 4), `spam-${i}`, wrong, { index: i % 4 });
      }

      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);
      route.inbox.advance(480);
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);

      const fetched = env.veaInboxProvider.getTransactionReceipt.mock.calls.map((call) => call[0]);
      expect(fetched).toHaveLength(1000);
      expect(new Set(fetched).size).toBe(1000);
    });

    it("every claimHashes read uses the outbox read block current at that read (no pinning across calls)", async () => {
      // Operator decision (hand fixes after run 004): the block is never carried between getClaim and
      // getClaimResolveState; each call asks getOutboxReadBlock afresh, so a finalized block that
      // advanced in between is used by the second read.
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      const first = route.outbox.block(route.outbox.resolve("latest") - 128);
      const second = route.outbox.block(route.outbox.resolve("latest") - 64);
      const blocks = [first, second];
      mockReadBlock.override = async () => {
        const block = blocks.shift() ?? second;
        return { number: block.number, timestamp: block.timestamp };
      };

      await getClaim(claimParams(env.veaOutbox, epoch) as any).catch(() => null);
      await getClaimResolveState(env.params);

      expect(env.veaOutbox.claimHashReads).toEqual([first.number, second.number]);
    });

    it("[L28] (f) falls back to the indexer's single SnapshotSent when the inbox scan fails", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      env.veaInbox.queryFilter.mockImplementation(async () => {
        throw new Error("inbox endpoint down");
      });
      env.params.fetchSnapshotSentFromGraph = jest.fn(async () => ({ txHash: env.sent.transactionHash }));

      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot).toEqual({ status: true, txHash: env.sent.transactionHash });
    });
  });

  describe("PRD 3.2 (BR-9): a restarted verification is reconstructed from the latest VerificationStarted", () => {
    // `startVerification` needs the claim to be sequencerDelayLimit + epochPeriod old.
    const epochAgo = 72;

    const restartedVerification = () => {
      const epoch = currentEpoch() - epochAgo;
      const { veaOutbox, claim, claimedBlock } = claimedOutbox(route.outbox, epoch);
      const firstStart = claimedBlock + 20_000;
      const secondStart = claimedBlock + 30_000;
      for (const [i, blockNumber] of [firstStart, secondStart].entries()) {
        veaOutbox.logs.push({
          event: "VerificationStarted",
          epoch,
          blockNumber,
          index: 0,
          transactionHash: txHashOf(`verify-${i}`),
          data: "0x",
          topics: [],
        });
      }
      const latest = {
        ...claim,
        timestampVerification: route.outbox.block(secondStart).timestamp,
        blocknumberVerification: secondStart,
      };
      veaOutbox.hashHistory.push([
        firstStart,
        hashClaim({
          ...claim,
          timestampVerification: route.outbox.block(firstStart).timestamp,
          blocknumberVerification: firstStart,
        }),
      ]);
      veaOutbox.hashHistory.push([secondStart, hashClaim(latest)]);
      return { epoch, veaOutbox, claim, latest, firstStart, secondStart };
    };

    it("log path: uses the last VerificationStarted log", async () => {
      const { epoch, veaOutbox, latest } = restartedVerification();

      const result = await getClaim(claimParams(veaOutbox, epoch) as any);

      expect(result).toEqual(latest);
    });

    it.each([
      ["oldest first", false],
      ["newest first", true],
    ])("indexer path: uses the latest verification (%s)", async (_label, newestFirst) => {
      const { epoch, veaOutbox, latest, firstStart, secondStart } = restartedVerification();
      // No Claimed log: reconstruction falls back to the indexer.
      veaOutbox.logs.splice(0, veaOutbox.logs.length);
      const verifications = [
        { startTimestamp: route.outbox.block(firstStart).timestamp, startTxHash: "0xfirst" },
        { startTimestamp: route.outbox.block(secondStart).timestamp, startTxHash: "0xsecond" },
      ];
      if (newestFirst) verifications.reverse();
      const outboxProvider = {
        ...route.outbox.provider,
        getTransactionReceipt: async (hash: string) => ({
          blockNumber: hash === "0xsecond" ? secondStart : firstStart,
        }),
      };
      const fetchClaimForEpoch = jest.fn(async () => ({
        id: "c",
        bridger: latest.claimer,
        stateRoot: latest.stateRoot,
        timestamp: latest.timestampClaimed,
        challenged: false,
        txHash: "0xclaim",
        verification: verifications,
        challenge: [],
      }));

      const result = await getClaim({
        ...claimParams(veaOutbox, epoch, { fetchClaimForEpoch }),
        veaOutboxProvider: outboxProvider,
      } as any);

      expect(fetchClaimForEpoch).toHaveBeenCalled();
      expect(result).toEqual(latest);
    });
  });

  describe("PRD 3.3 (BR-9): escape-hatch states are reconstructed", () => {
    const parties: Array<[string, boolean, boolean]> = [
      ["neither zeroed", false, false],
      ["claimer zeroed", true, false],
      ["challenger zeroed", false, true],
      ["both zeroed", true, true],
    ];
    const honests = [ClaimHonestState.NONE, ClaimHonestState.CLAIMER, ClaimHonestState.CHALLENGER];
    const cases = parties.flatMap(([label, zc, zch]) => honests.map((h) => [label, h, zc, zch] as const));

    it.each(cases)("verifyClaimHash recovers %s with honest=%s", (_label, honest, zeroClaimer, zeroChallenger) => {
      const reconstructed = baseClaim({ timestampClaimed: 100, challenger: CHALLENGER });
      const onChain = {
        ...reconstructed,
        honest,
        claimer: zeroClaimer ? ethers.ZeroAddress : CLAIMER,
        challenger: zeroChallenger ? ethers.ZeroAddress : CHALLENGER,
      };

      expect(verifyClaimHash({ claim: reconstructed, claimHash: hashClaim(onChain) })).toEqual(onChain);
    });

    it("verifyClaimHash returns null when no variant matches", () => {
      const reconstructed = baseClaim({ timestampClaimed: 100, challenger: CHALLENGER });

      expect(
        verifyClaimHash({ claim: reconstructed, claimHash: hashClaim({ ...reconstructed, stateRoot: WRONG_ROOT }) })
      ).toBeNull();
    });

    const challengedOutbox = (epoch: number) => {
      const env = claimedOutbox(route.outbox, epoch);
      const challengeBlock = env.claimedBlock + 100;
      env.veaOutbox.logs.push({
        event: "Challenged",
        epoch,
        blockNumber: challengeBlock,
        index: 0,
        transactionHash: txHashOf("challenge"),
        data: "0x",
        topics: [ethers.id("Challenged(uint256,address)"), encodeEpoch(epoch), topicOf(CHALLENGER)],
      });
      return { ...env, challengeBlock, challenged: { ...env.claim, challenger: CHALLENGER.toLowerCase() } };
    };

    it("getClaim returns the claimer-zeroed claim after withdrawClaimerEscapeHatch and emits ESCAPE_HATCH detected once", async () => {
      const epoch = currentEpoch() - 3;
      const { veaOutbox, challenged, challengeBlock } = challengedOutbox(epoch);
      const afterWithdrawal = { ...challenged, claimer: ethers.ZeroAddress };
      veaOutbox.hashHistory.push([challengeBlock, hashClaim(challenged)]);
      veaOutbox.hashHistory.push([challengeBlock + 10, hashClaim(afterWithdrawal)]);

      const first = await getClaim(claimParams(veaOutbox, epoch) as any);
      const second = await getClaim(claimParams(veaOutbox, epoch) as any);

      expect(first).toEqual(afterWithdrawal);
      expect(second).toEqual(afterWithdrawal);
      expect(emitter.of(BotEvents.ESCAPE_HATCH)).toEqual([
        { chainId: CHAIN_ID, network: NETWORK, epoch, action: "detected", party: "claimer" },
      ]);
    });

    it("getClaim returns the challenger-zeroed claim after withdrawChallengerEscapeHatch", async () => {
      // Zeroing the challenger restores the unchallenged claim's hash, so the log path's
      // first (unchallenged) candidate already matches: the struct is right, and on-chain the
      // claim is indistinguishable from one never challenged.
      const epoch = currentEpoch() - 4;
      const { veaOutbox, claim, challenged, challengeBlock } = challengedOutbox(epoch);
      const afterWithdrawal = { ...challenged, challenger: ethers.ZeroAddress };
      veaOutbox.hashHistory.push([challengeBlock + 10, hashClaim(afterWithdrawal)]);

      const result = await getClaim(claimParams(veaOutbox, epoch) as any);

      expect(result).toEqual(afterWithdrawal);
      expect(result).toEqual(claim);
    });

    it("indexer path: detects a challenger-zeroed claim and emits ESCAPE_HATCH detected", async () => {
      const epoch = currentEpoch() - 4;
      const { veaOutbox, claim, challengeBlock } = challengedOutbox(epoch);
      veaOutbox.logs.splice(0, veaOutbox.logs.length); // no Claimed log: fall back to the indexer
      veaOutbox.hashHistory.push([challengeBlock + 10, hashClaim(claim)]);
      const fetchClaimForEpoch = jest.fn(async () => ({
        id: "c",
        bridger: claim.claimer,
        stateRoot: claim.stateRoot,
        timestamp: claim.timestampClaimed,
        challenged: true,
        txHash: "0xclaim",
        verification: [],
        challenge: [{ challenger: CHALLENGER }],
      }));

      const result = await getClaim(claimParams(veaOutbox, epoch, { fetchClaimForEpoch }) as any);

      expect(result).toEqual(claim);
      expect(emitter.of(BotEvents.ESCAPE_HATCH)).toEqual([
        { chainId: CHAIN_ID, network: NETWORK, epoch, action: "detected", party: "challenger" },
      ]);
    });

    it("#19 (A-6): log path reconstructs a claim re-challenged after a challenger escape-hatch withdrawal", async () => {
      const epoch = currentEpoch() - 6;
      const { veaOutbox, challenged, challengeBlock } = challengedOutbox(epoch);
      const SECOND = "0x2222222222222222222222222222222222222222";
      veaOutbox.logs.push({
        event: "Challenged",
        epoch,
        blockNumber: challengeBlock + 50,
        index: 0,
        transactionHash: txHashOf("re-challenge"),
        data: "0x",
        topics: [ethers.id("Challenged(uint256,address)"), encodeEpoch(epoch), topicOf(SECOND)],
      });
      const rechallenged = { ...challenged, challenger: SECOND.toLowerCase() };
      veaOutbox.hashHistory.push([challengeBlock + 50, hashClaim(rechallenged)]);

      expect(await getClaim(claimParams(veaOutbox, epoch) as any)).toEqual(rechallenged);
    });

    it.each([
      ["first", true],
      ["second", false],
    ])("#19: indexer path finds the stored challenger listed %s", async (_label, storedFirst) => {
      const epoch = currentEpoch() - 6;
      const { veaOutbox, claim, challengeBlock } = challengedOutbox(epoch);
      veaOutbox.logs.splice(0, veaOutbox.logs.length); // no Claimed log: fall back to the indexer
      const SECOND = "0x2222222222222222222222222222222222222222";
      const stored = { ...claim, challenger: SECOND };
      veaOutbox.hashHistory.push([challengeBlock + 50, hashClaim(stored)]);
      const challenges = [{ challenger: CHALLENGER }, { challenger: SECOND }];
      if (storedFirst) challenges.reverse();
      const fetchClaimForEpoch = jest.fn(async () => ({
        id: "c",
        bridger: claim.claimer,
        stateRoot: claim.stateRoot,
        timestamp: claim.timestampClaimed,
        challenged: true,
        txHash: "0xclaim",
        verification: [],
        challenge: challenges,
      }));

      expect(await getClaim(claimParams(veaOutbox, epoch, { fetchClaimForEpoch }) as any)).toEqual(stored);
    });

    it("does not emit ESCAPE_HATCH for an ordinary challenged claim", async () => {
      const epoch = currentEpoch() - 5;
      const { veaOutbox, challenged, challengeBlock } = challengedOutbox(epoch);
      veaOutbox.hashHistory.push([challengeBlock, hashClaim(challenged)]);

      expect(await getClaim(claimParams(veaOutbox, epoch) as any)).toEqual(challenged);
      expect(emitter.of(BotEvents.ESCAPE_HATCH)).toEqual([]);
    });
  });

  describe("#14 / [L20]: getClaimResolveState never sets failedResolution nor emits FAILED_RESOLUTION", () => {
    it("ignores an outbox FailedResolution(E) after the adopted ticket", async () => {
      const epoch = currentEpoch() - 3;
      const sentAt = (epoch + 1) * EPOCH_PERIOD + 1800;
      const env = resolveEnv(epoch, { sentAt });
      env.failResolution(sentAt + 600, epoch, "failed");

      const first = await getClaimResolveState(env.params);
      const second = await getClaimResolveState(env.params);

      for (const state of [first, second]) {
        expect(state.failedResolution).toBeUndefined();
        expect(state.sendSnapshot).toEqual({ status: true, txHash: env.sent.transactionHash });
      }
      expect(emitter.of(BotEvents.FAILED_RESOLUTION)).toEqual([]);
      expect(env.veaOutbox.queries).toEqual([]);
    });

    it("re-send follows from adoption alone: a failed (stale) ticket is not adopted, a re-sent one is", async () => {
      const epoch = currentEpoch() - 3;
      const sentAt = (epoch + 1) * EPOCH_PERIOD + 1800;
      const stale = baseClaim({ timestampClaimed: (epoch + 1) * EPOCH_PERIOD + 600 });
      const env = resolveEnv(epoch, { sentAt, sentClaim: stale });
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);

      const resentAt = route.inbox.block("latest").timestamp + 60;
      route.inbox.advance(10_000);
      const resent = env.sendSnapshot(resentAt, "send-2", env.claim);
      const state = await getClaimResolveState(env.params);

      expect(state.failedResolution).toBeUndefined();
      expect(state.sendSnapshot).toEqual({ status: true, txHash: resent.transactionHash });
    });
  });

  describe("PRD 4.10 / [L29] (a): the SnapshotSent cursor rescans only finalized_prev+1..latest", () => {
    it.each([
      ["headBlockTag 'latest'", { headBlockTag: "latest" }],
      ["headBlockTag omitted", {}],
    ])("cycle 2 makes at most ceil(range / DEFAULT_CHUNK_SIZE) inbox calls (%s)", async (_label, extra) => {
      // Six days into the dispute; the snapshot was sent right at the start, ~2M Arbitrum blocks back.
      const epoch = currentEpoch() - 144;
      const sentAt = (epoch + 1) * EPOCH_PERIOD + 600;
      const env = resolveEnv(epoch, { sentAt });
      const params = { ...env.params, ...extra };

      const first = await getClaimResolveState(params);
      const firstInbox = env.veaInbox.queryFilter.mock.calls.length;
      expect(firstInbox).toBeGreaterThan(1000); // the one-off cold scan
      const finalizedPrev = route.inbox.resolve("finalized");

      // One cycle (2 minutes) later.
      route.inbox.advance(480);
      route.outbox.advance(24);
      route.router.advance(10);
      const second = await getClaimResolveState(params);

      const latest = route.inbox.resolve("latest");
      const secondCalls = env.veaInbox.queries.slice(firstInbox);
      expect(secondCalls.length).toBeLessThanOrEqual(Math.ceil((latest - finalizedPrev) / DEFAULT_CHUNK_SIZE));
      expect(Math.min(...secondCalls.map((q) => q.from))).toBe(finalizedPrev + 1);
      expect(Math.max(...secondCalls.map((q) => q.to))).toBe(latest);
      expect(env.veaOutbox.queryFilter).not.toHaveBeenCalled();
      expect(second.sendSnapshot).toEqual(first.sendSnapshot);
      expect(second.sendSnapshot.status).toBe(true);
      // The adopted ticket's receipt facts are cached by txHash.
      expect(env.veaInboxProvider.getTransactionReceipt).toHaveBeenCalledTimes(1);
    });

    it("picks up a snapshot sent after the previous cycle's scan", async () => {
      const epoch = currentEpoch() - 3;
      const sentAt = (epoch + 1) * EPOCH_PERIOD + 600;
      const env = resolveEnv(epoch, { sentAt, sentClaim: baseClaim({ stateRoot: WRONG_ROOT }) });
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);

      // A correct snapshot lands, then becomes finalized on the inbox chain.
      const now = route.inbox.block("latest").timestamp;
      route.inbox.advance(10_000);
      const resent = env.sendSnapshot(now + 60, "send-correct", env.claim);
      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot).toEqual({ status: true, txHash: resent.transactionHash });
    });

    it("re-reads an unfinalized SnapshotSent each cycle instead of caching it in the cursor", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      const fresh = env.sendSnapshot(route.inbox.block("latest").timestamp - 60, "fresh", env.claim);
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(true);

      // Reorged out before it was finalized.
      env.veaInbox.logs.splice(
        env.veaInbox.logs.findIndex((log) => log.transactionHash === fresh.transactionHash),
        1
      );
      route.inbox.advance(4);

      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);
    });

    it("keeps the cached snapshot when a failed-over endpoint reports an older inbox head", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 600 });
      await getClaimResolveState(env.params);
      const calls = env.veaInbox.queryFilter.mock.calls.length;

      const lagging = {
        ...env.params.veaInboxProvider,
        getBlock: async () => route.inbox.block(route.inbox.resolve("finalized") - 1000),
      };
      const state = await getClaimResolveState({ ...env.params, veaInboxProvider: lagging });

      expect(env.veaInbox.queryFilter.mock.calls.length).toBe(calls);
      expect(state.sendSnapshot.status).toBe(true);
    });
  });
});
