import { ethers, getAddress } from "ethers";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import {
  getClaim,
  hashClaim,
  getClaimResolveState,
  ClaimResolveStateParams,
  createClaimResolveCache,
  verifyClaimHash,
  ClaimHonestState,
} from "./claim";
import { ClaimNotFoundError } from "./errors";
import { MockEmitter } from "./emitter";
import { Network } from "../consts/bridgeRoutes";

import { EventEmitter } from "events";
import { getOutboxReadBlock } from "./arbToEthState";
import { DEFAULT_CHUNK_SIZE } from "./logScanner";
import { BotEvents } from "./botEvents";
import { getBridgeConfig } from "../consts/bridgeRoutes";
import {
  createFakeChain,
  createTwoChainRoute,
  FakeChain,
  TwoChainRoute,
  WrongChainBlockError,
} from "../testUtils/twoChainFixture";

// Lets a test replace the outbox read block (e.g. latest - 64 during a finality stall)
// while every other test reads through the real `getOutboxReadBlock`.
const mockReadBlock: { override?: (params: any) => Promise<{ number: number; timestamp: number }> } = {};
jest.mock("./arbToEthState", () => {
  const actual = jest.requireActual("./arbToEthState");
  return {
    ...actual,
    getOutboxReadBlock: jest.fn((params: any) =>
      mockReadBlock.override ? mockReadBlock.override(params) : actual.getOutboxReadBlock(params)
    ),
  };
});

let mockClaim: ClaimStruct;
// Pre calculated from the deployed contracts
const hashedMockClaim = "0xfee47661ef0432da320c3b4706ff7d412f421b9d1531c33ce8f2e03bfe5dcfa2";
const mockBlockTag = "latest";
const mockFromBlock = 0;
const network = Network.DEVNET;

describe("snapshotClaim", () => {
  describe("getClaim", () => {
    // A modelled outbox chain: block n has timestamp 12n, head finalized at 5000.
    const SEC_PER_BLOCK = 12;
    const HEAD_BLOCK = 5000;
    const epoch = 1;
    const epochPeriod = 7200;
    // Claims for epoch E can only be made during [(E+1)*P, (E+2)*P) - blocks 1200..1799 here.
    const claimWindowFirstBlock = ((epoch + 1) * epochPeriod) / SEC_PER_BLOCK; // 1200
    const claimWindowLastBlock = ((epoch + 2) * epochPeriod) / SEC_PER_BLOCK - 1; // 1799
    // Deliberately in the last third of the window: the old implementation anchored
    // its scan at block E*P (600) and clamped it to 1000 blocks, so a claim here was
    // invisible to it. This is the A1 detection gap.
    const claimedBlock = 1750;

    let veaOutbox: any;
    let veaOutboxProvider: any;
    let queriedRanges: Array<{ event: string; from: number; to: number }>;
    let mockClaimParams: any;
    let mockFetchClaim: jest.Mock;
    const mockEmitter = new MockEmitter();

    const claimedLog = () => ({
      data: mockClaim.stateRoot,
      topics: [null, `0x000000000000000000000000${mockClaim.claimer.toString().slice(2)}`],
      blockNumber: claimedBlock,
      index: 0,
    });

    beforeEach(() => {
      queriedRanges = [];
      mockClaim = {
        stateRoot: "0xeac817ed5c5b3d1c2c548f231b7cf9a0dfd174059f450ec6f0805acf6a16a551",
        claimer: "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288",
        timestampClaimed: claimedBlock * SEC_PER_BLOCK,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      };
      veaOutbox = {
        queryFilter: jest.fn(async (filter: any, from: number, to: number) => {
          queriedRanges.push({ event: filter?.event ?? "unknown", from, to });
          return [];
        }),
        filters: {
          VerificationStarted: jest.fn(() => ({ event: "VerificationStarted" })),
          Challenged: jest.fn(() => ({ event: "Challenged" })),
          Claimed: jest.fn(() => ({ event: "Claimed" })),
        },
        claimHashes: jest.fn(),
        getAddress: jest.fn(),
      };
      veaOutboxProvider = {
        getBlock: jest.fn(async (tag: any) => {
          const number = typeof tag === "number" ? tag : HEAD_BLOCK;
          return { number, timestamp: number * SEC_PER_BLOCK };
        }),
      };
      mockFetchClaim = jest.fn();
      mockClaimParams = {
        network,
        chainId: 0,
        veaOutbox,
        veaOutboxProvider,
        epoch,
        epochPeriod,
        emitter: mockEmitter,
        fetchClaimForEpoch: mockFetchClaim,
      };
    });

    /** Serve the given logs for `event`, and nothing for every other event. */
    const serve = (logsByEvent: Record<string, any[]>) => {
      veaOutbox.queryFilter = jest.fn(async (filter: any, from: number, to: number) => {
        const event = filter?.event ?? "unknown";
        queriedRanges.push({ event, from, to });
        return (logsByEvent[event] ?? []).filter((log) => log.blockNumber >= from && log.blockNumber <= to);
      });
      mockClaimParams.veaOutbox = veaOutbox;
    };

    const rangesFor = (event: string) => queriedRanges.filter((r) => r.event === event);

    it("scans the whole window in which a claim for the epoch could have been made", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({ Claimed: [claimedLog()] });

      await getClaim(mockClaimParams);

      const claimedRanges = rangesFor("Claimed");
      expect(claimedRanges.length).toBeGreaterThan(0);
      const scannedFrom = Math.min(...claimedRanges.map((r) => r.from));
      const scannedTo = Math.max(...claimedRanges.map((r) => r.to));
      // The window must contain every block in which `claim()` could have succeeded.
      expect(scannedFrom).toBeLessThanOrEqual(claimWindowFirstBlock);
      expect(scannedTo).toBeGreaterThanOrEqual(claimWindowLastBlock);
    });

    it("reads the claim hash at the same finalized block the logs are scanned to", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({ Claimed: [claimedLog()] });

      await getClaim(mockClaimParams);

      // Reading the hash at the head while scanning logs only to finalized makes
      // reconstruction fail whenever an event lands in between.
      expect(veaOutbox.claimHashes).toHaveBeenCalledWith(epoch, { blockTag: HEAD_BLOCK });
      expect(Math.max(...queriedRanges.map((r) => r.to))).toBeLessThanOrEqual(HEAD_BLOCK);
    });

    it("finds a claim made in the last third of the window", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({ Claimed: [claimedLog()] });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
      expect(mockFetchClaim).not.toHaveBeenCalled();
    });

    it("returns a valid claim with a challenger", async () => {
      mockClaim.challenger = "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288";
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [claimedLog()],
        Challenged: [
          {
            blockNumber: claimedBlock + 10,
            index: 0,
            topics: [null, null, `0x000000000000000000000000${mockClaim.challenger.toString().slice(2)}`],
          },
        ],
      });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
    });

    it("returns a valid claim with verification", async () => {
      const verificationBlock = claimedBlock + 20;
      mockClaim.timestampVerification = verificationBlock * SEC_PER_BLOCK;
      mockClaim.blocknumberVerification = verificationBlock;
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [claimedLog()],
        VerificationStarted: [{ blockNumber: verificationBlock, index: 0 }],
      });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
    });

    it("reports honest=CLAIMER for a claim the outbox has already verified", async () => {
      const verificationBlock = claimedBlock + 20;
      mockClaim.timestampVerification = verificationBlock * SEC_PER_BLOCK;
      mockClaim.blocknumberVerification = verificationBlock;
      mockClaim.honest = 1; // Party.Claimer
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [claimedLog()],
        VerificationStarted: [{ blockNumber: verificationBlock, index: 0 }],
      });

      const claim = await getClaim(mockClaimParams);

      // The returned struct must be the one that hashes to the on-chain claim
      // hash, otherwise every contract call taking it reverts with "Invalid claim."
      expect(hashClaim(claim!)).toEqual(hashClaim(mockClaim));
      expect(claim!.honest).toEqual(1);
    });

    it("reports honest=CHALLENGER for a claim the challenger has won", async () => {
      mockClaim.challenger = "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288";
      mockClaim.honest = 2; // Party.Challenger
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [claimedLog()],
        Challenged: [
          {
            blockNumber: claimedBlock + 10,
            index: 0,
            topics: [null, null, `0x000000000000000000000000${mockClaim.challenger.toString().slice(2)}`],
          },
        ],
      });

      const claim = await getClaim(mockClaimParams);

      expect(hashClaim(claim!)).toEqual(hashClaim(mockClaim));
      expect(claim!.honest).toEqual(2);
    });

    it("falls back to the subgraph when the log scan throws", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      veaOutbox.queryFilter = jest.fn(() => {
        throw new Error("Logs not available");
      });
      mockClaimParams.veaOutbox = veaOutbox;
      mockClaimParams.fetchClaimForEpoch = mockFetchClaim.mockResolvedValueOnce({
        id: "1",
        stateRoot: mockClaim.stateRoot,
        bridger: mockClaim.claimer,
        timestamp: mockClaim.timestampClaimed,
        verification: null,
        challenge: null,
      });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
    });

    it("falls back to the subgraph when the scan finds no Claimed log despite a non-zero claim hash", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({});
      mockClaimParams.fetchClaimForEpoch = mockFetchClaim.mockResolvedValueOnce({
        id: "1",
        stateRoot: mockClaim.stateRoot,
        bridger: mockClaim.claimer,
        timestamp: mockClaim.timestampClaimed,
        verification: null,
        challenge: null,
      });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
    });

    it("returns null when no claim was made for the epoch", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(ethers.ZeroHash);
      mockClaimParams.veaOutbox = veaOutbox;

      const claim = await getClaim(mockClaimParams);

      expect(claim).toBeNull();
      expect(veaOutbox.queryFilter).toHaveBeenCalledTimes(0);
    });

    it("throws when neither the logs nor the subgraph yield the claim", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({});
      mockClaimParams.fetchClaimForEpoch = jest.fn().mockResolvedValueOnce(null);

      await expect(getClaim(mockClaimParams)).rejects.toThrow(new ClaimNotFoundError(epoch));
    });

    it("throws when the reconstructed claim does not match the on-chain claim hash", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [
          {
            data: mockClaim.stateRoot,
            topics: [null, `0x000000000000000000000000${ethers.ZeroAddress.toString().slice(2)}`],
            blockNumber: claimedBlock,
            index: 0,
          },
        ],
      });
      mockClaimParams.fetchClaimForEpoch = jest.fn().mockResolvedValueOnce(null);

      await expect(getClaim(mockClaimParams)).rejects.toThrow(new ClaimNotFoundError(epoch));
    });
  });

  describe("hashClaim", () => {
    beforeEach(() => {
      mockClaim = {
        stateRoot: "0xeac817ed5c5b3d1c2c548f231b7cf9a0dfd174059f450ec6f0805acf6a16a551",
        claimer: "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288",
        timestampClaimed: 1730276784,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      };
    });
    it("should return a valid hash", () => {
      const hash = hashClaim(mockClaim);
      expect(hash).toBeDefined();
      expect(hash).toEqual(hashedMockClaim);
    });

    it("should not return a valid hash", () => {
      mockClaim.honest = 1;
      const hash = hashClaim(mockClaim);
      expect(hash).toBeDefined();
      expect(hash).not.toEqual(hashedMockClaim);
    });
  });
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
const OUR_SIGNER = "0x00000000000000000000000000000000000000aa";
const OTHER_SENDER = "0x000000000000000000000000000000000000beef";

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

describe("claim reconstruction and dispute tickets (two-chain route, chain 10200)", () => {
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

  describe("outbox head reads go through getOutboxReadBlock", () => {
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
  });

  /**
   * A dispute for `epoch`: the claim is challenged on the outbox, and a snapshot is sent on
   * Arbitrum Sepolia. Each send's receipt carries the ArbSys `L2ToL1Tx` the inbox emits, built by
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
    const transactions: Record<string, { from: string; to: string; data: string } | null> = {};
    /** A `sendSnapshot(epoch, [gasLimit,] claim)` transaction on the inbox, by `from`. */
    const sendSnapshot = (
      timestamp: number,
      label: string,
      claimSent: ClaimStruct,
      { from = OUR_SIGNER, to = INBOX, index = 0 }: { from?: string; to?: string; index?: number } = {}
    ) => {
      const blockNumber = blockAt(route.inbox, timestamp);
      const transactionHash = txHashOf(label);
      const args = chainId === 10200 ? [epoch, 3_000_000, claimSent] : [epoch, claimSent];
      transactions[transactionHash] = { from, to, data: veaInbox.interface.encodeFunctionData("sendSnapshot", args) };
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
      getTransaction: jest.fn(async (hash: string) => transactions[hash] ?? null),
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
      signerAddress: OUR_SIGNER,
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
      transactions,
      sendSnapshot,
      failResolution,
      fetchMessageStatus,
    };
  };

  describe("getClaimResolveState pins each read to its own chain", () => {
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
  });

  describe("only our own sendSnapshot carrying the current claim is followed", () => {
    it("follows our send and asks the Sepolia provider for its message status", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });

      const state = await getClaimResolveState(env.params);

      expect(state.sendSnapshot).toEqual({ status: true, txHash: env.sent.transactionHash });
      expect(state.execution.status).toBe(1);
      const [, child, parent] = env.fetchMessageStatus.mock.calls[0];
      expect(child).toBe(env.params.veaInboxProvider);
      expect(parent).toBe(route.router.provider);
    });

    it.each([[10200], [11155111]])("chain %s: decodes the claim with the inbox's own interface", async (chainId) => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { chainId, sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(true);
    });

    it("ignores a third party's send, even one carrying the current claim: junk sends cannot stall the dispute", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1200, "theirs-correct", env.claim, { from: OTHER_SENDER });
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1500, "theirs-wrong", baseClaim({ stateRoot: WRONG_ROOT }), {
        from: OTHER_SENDER,
      });
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);
      expect(env.fetchMessageStatus).not.toHaveBeenCalled();

      // Ours lands later, at the inbox head: it is the one followed, whatever came before it.
      const ours = env.sendSnapshot(route.inbox.block("latest").timestamp - 60, "ours", env.claim);
      expect((await getClaimResolveState(env.params)).sendSnapshot).toEqual({
        status: true,
        txHash: ours.transactionHash,
      });
    });

    it("ignores our transaction when it was sent to another contract", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1800, "relay", env.claim, { to: OTHER_SENDER });
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);
    });

    it("does not follow our send once the claim changed on the outbox (it must be re-sent)", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(true);

      const changed = { ...env.claim, timestampVerification: 1, blocknumberVerification: 2 };
      route.outbox.advance(10);
      env.veaOutbox.hashHistory.push([route.outbox.resolve("latest") - 5, hashClaim(changed)]);
      mockReadBlock.override = async () => route.outbox.block("latest");

      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);
      // The transaction's calldata is cached; only the claim hash was re-read.
      expect(env.veaInboxProvider.getTransaction).toHaveBeenCalledTimes(1);
    });

    it("follows the earliest of our matching sends", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      const older = env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1200, "older", env.claim, { index: 3 });
      env.sendSnapshot((epoch + 1) * EPOCH_PERIOD + 1200, "newer", env.claim, { index: 7 });
      expect((await getClaimResolveState(env.params)).sendSnapshot.txHash).toBe(older.transactionHash);
    });

    it("sees a send above the inbox finalized block", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, {});
      const fresh = env.sendSnapshot(route.inbox.block("latest").timestamp - 60, "fresh", env.claim);
      expect(fresh.blockNumber).toBeGreaterThan(route.inbox.resolve("finalized"));
      expect((await getClaimResolveState(env.params)).sendSnapshot.txHash).toBe(fresh.transactionHash);
    });

    it("a transaction the endpoint does not know yet is retried next cycle, not cached as unknown", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      const tx = env.transactions[env.sent.transactionHash];
      env.transactions[env.sent.transactionHash] = null;
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(false);
      env.transactions[env.sent.transactionHash] = tx;
      expect((await getClaimResolveState(env.params)).sendSnapshot.status).toBe(true);
      expect(env.veaInboxProvider.getTransaction).toHaveBeenCalledTimes(2);
    });

    it("with no signer nothing is followed", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      expect((await getClaimResolveState({ ...env.params, signerAddress: undefined })).sendSnapshot.status).toBe(false);
    });

    it("every claimHashes read uses the outbox read block current at that read (no pinning across calls)", async () => {
      // The block is never carried between getClaim and getClaimResolveState: each call asks
      // getOutboxReadBlock afresh, so a finalized block that advanced in between is used.
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

    it("falls back to the indexer's single SnapshotSent when the inbox scan fails", async () => {
      const epoch = currentEpoch() - 3;
      const env = resolveEnv(epoch, { sentAt: (epoch + 1) * EPOCH_PERIOD + 1800 });
      env.veaInbox.queryFilter.mockImplementation(async () => {
        throw new Error("inbox endpoint down");
      });
      env.params.fetchSnapshotSentFromGraph = jest.fn(async () => ({ txHash: env.sent.transactionHash }));
      expect((await getClaimResolveState(env.params)).sendSnapshot).toEqual({
        status: true,
        txHash: env.sent.transactionHash,
      });
    });
  });

  describe("a restarted verification is reconstructed from the latest VerificationStarted", () => {
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

  describe("escape-hatch states are reconstructed", () => {
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

    it("log path reconstructs a claim re-challenged after a challenger escape-hatch withdrawal", async () => {
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
    ])("indexer path finds the stored challenger listed %s", async (_label, storedFirst) => {
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
  });

  describe("getClaimResolveState never sets failedResolution nor emits FAILED_RESOLUTION", () => {
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

  describe("the SnapshotSent cursor rescans only finalized_prev+1..latest", () => {
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
      // Our send's calldata is cached by txHash.
      expect(env.veaInboxProvider.getTransaction).toHaveBeenCalledTimes(1);
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
  });
});
