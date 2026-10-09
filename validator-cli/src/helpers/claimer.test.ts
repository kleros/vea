import { ethers } from "ethers";
import { checkAndClaim, CheckAndClaimParams } from "./claimer";
import { createTwoChainRoute, TwoChainRoute } from "../testUtils/twoChainFixture";
import { getBridgeConfig, Network } from "../consts/bridgeRoutes";
import { resolveSettledReadBlocks, FINALITY_STALL_SECS, OUTBOX_STALL_DEPTH_BLOCKS } from "../utils/arbToEthState";
import { EpochOutcome } from "../utils/epochOutcome";
import { BotEvents } from "../utils/botEvents";
import { CannotFundError } from "../utils/transactionHandlers";
import { ClaimHonestState } from "../utils/claim";
import { resetBridgeShutdownAlerts } from "./escapeHatch";

const CHAIN_ID = 10200;
const P = getBridgeConfig(CHAIN_ID).routeConfig[Network.TESTNET].epochPeriod;
// Half an epoch past a boundary, so the inbox `finalized` block (20 min behind) is already in the new epoch.
const NOW = Math.floor(1_760_000_000 / P) * P + P / 2;
const CLAIMABLE = Math.floor(NOW / P) - 1;
const SAVED = "0x" + "11".repeat(32);
const OUTBOX_ROOT = "0x" + "22".repeat(32);
const OUR_ADDRESS = "0x00000000000000000000000000000000000000aa";
const OTHER = "0x00000000000000000000000000000000000000c1";

const makeClaimStruct = (overrides: Record<string, unknown> = {}): any => ({
  stateRoot: SAVED,
  claimer: OTHER,
  timestampClaimed: NOW - P,
  timestampVerification: 0,
  blocknumberVerification: 0,
  honest: ClaimHonestState.NONE,
  challenger: ethers.ZeroAddress,
  ...overrides,
});

interface Setup {
  route: TwoChainRoute;
  params: CheckAndClaimParams;
  handler: any;
  outcomes: EpochOutcome[];
  emitter: { emit: jest.Mock };
  veaOutbox: any;
  veaInbox: any;
  scannedRanges: Array<[number, number]>;
  fetchLatestClaimedEpoch: jest.Mock;
}

/** A claimer wired to the two-chain fixture: every pinned read throws on another chain's block. */
const setup = ({ claimedLogs = [] as any[] } = {}): Setup => {
  const route = createTwoChainRoute({ now: NOW });
  const scannedRanges: Array<[number, number]> = [];
  const veaInbox = { snapshots: jest.fn(route.inbox.pinned(() => SAVED)) };
  const veaOutbox = {
    target: "0xoutbox",
    stateRoot: jest.fn(route.outbox.pinned(() => OUTBOX_ROOT)),
    filters: { Claimed: jest.fn(() => ({ event: "Claimed" })) },
    queryFilter: jest.fn(async (_filter: any, from: number, to: number) => {
      route.outbox.assertOwnBlock(from);
      route.outbox.assertOwnBlock(to);
      scannedRanges.push([from, to]);
      return claimedLogs.filter((log) => log.blockNumber >= from && log.blockNumber <= to);
    }),
  };
  const handler: any = {
    veaInboxProvider: route.inbox.provider,
    veaOutboxProvider: route.outbox.provider,
    veaRouterProvider: route.router.provider,
    network: Network.TESTNET,
    transactions: {},
    claim: null,
    makeClaim: jest.fn().mockResolvedValue(undefined),
    withdrawClaimDeposit: jest.fn().mockResolvedValue(undefined),
    startVerification: jest.fn().mockResolvedValue(undefined),
    verifySnapshot: jest.fn().mockResolvedValue(undefined),
    devnetAdvanceState: jest.fn().mockResolvedValue(undefined),
    isBridgeShutdown: jest.fn().mockResolvedValue(false),
    getSignerAddress: jest.fn().mockReturnValue(OUR_ADDRESS),
    withdrawClaimerEscapeHatch: jest.fn().mockResolvedValue(undefined),
  };
  const outcomes: EpochOutcome[] = [];
  const emitter = { emit: jest.fn() };
  const fetchLatestClaimedEpoch = jest.fn().mockResolvedValue(undefined);
  const params: CheckAndClaimParams = {
    chainId: CHAIN_ID,
    network: Network.TESTNET,
    claim: null,
    epoch: CLAIMABLE,
    epochPeriod: P,
    veaInbox,
    veaInboxProvider: route.inbox.provider,
    veaOutbox,
    veaOutboxProvider: route.outbox.provider,
    veaRouterProvider: route.router.provider,
    transactionHandler: handler,
    emitter: emitter as any,
    fetchLatestClaimedEpoch,
    fetchSettledReadBlocks: jest.fn(async () => ({
      inboxBlock: route.inbox.block("finalized").number,
      outboxBlock: route.outbox.block("finalized").number,
    })),
    now: NOW * 1000,
    reportOutcome: (outcome) => outcomes.push(outcome),
  };
  return { route, params, handler, outcomes, emitter, veaOutbox, veaInbox, scannedRanges, fetchLatestClaimedEpoch };
};

/** Replace the outbox provider's `finalized` block with one `lagSecs` behind latest. */
const withFinalizedLag = (s: Setup, lagSecs: number) => {
  const chain = s.route.outbox;
  const lagBlocks = Math.ceil(lagSecs / chain.options.secondsPerBlock);
  s.params.veaOutboxProvider = {
    ...chain.provider,
    getBlock: async (tag: any) => chain.block(tag === "finalized" ? chain.resolve("latest") - lagBlocks : tag),
  };
  return chain.block(chain.resolve("latest") - lagBlocks);
};

describe("claimer", () => {
  beforeEach(() => resetBridgeShutdownAlerts());

  describe("making a claim", () => {
    it("reads the snapshot at the settled inbox block and the outbox on its own chain", async () => {
      const s = setup();
      const fetchBlocksAndCheckFinality = jest.fn(async (l1: any, inbox: any) => {
        // The finality check runs against Arbitrum's L1 (the Sepolia router), never against Chiado.
        expect(l1).toBe(s.route.router.provider);
        expect(inbox).toBe(s.route.inbox.provider);
        return [s.route.inbox.block("finalized"), s.route.router.block("finalized"), false, false] as any;
      });
      s.params.fetchSettledReadBlocks = resolveSettledReadBlocks;
      s.params.fetchBlocksAndCheckFinality = fetchBlocksAndCheckFinality;

      await checkAndClaim(s.params);

      // The fixture throws on a Sepolia block number, so reaching the claim proves every outbox
      // read and Claimed chunk was pinned to Chiado blocks.
      expect(Math.max(...s.scannedRanges.map((r) => r[1]))).toBe(s.route.outbox.block("finalized").number);
      expect(s.handler.makeClaim).toHaveBeenCalledWith(SAVED);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("claims on savedSnapshot != outboxStateRoot alone when neither the logs nor the indexer hold a claim", async () => {
      const s = setup();
      await checkAndClaim(s.params);
      expect(s.fetchLatestClaimedEpoch).toHaveBeenCalledWith("0xoutbox", CHAIN_ID);
      expect(s.handler.makeClaim).toHaveBeenCalledWith(SAVED);
    });

    it("does not claim a snapshot the indexer says was already claimed", async () => {
      const s = setup();
      s.fetchLatestClaimedEpoch.mockResolvedValue({ stateRoot: SAVED });
      await checkAndClaim(s.params);
      expect(s.handler.makeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("does not claim when the outbox already holds the snapshot", async () => {
      const s = setup();
      s.veaOutbox.stateRoot = jest.fn(s.route.outbox.pinned(() => SAVED));
      await checkAndClaim(s.params);
      expect(s.handler.makeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("is DONE for an epoch with no snapshot, UNDECIDABLE while the epoch is not settled", async () => {
      const s = setup();
      s.veaInbox.snapshots = jest.fn(s.route.inbox.pinned(() => ethers.ZeroHash));
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);

      const t = setup();
      t.params.fetchSettledReadBlocks = jest.fn().mockResolvedValue(null);
      await checkAndClaim(t.params);
      expect(t.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("reports UNDECIDABLE instead of claiming when the Claimed scan and the indexer both fail", async () => {
      const s = setup();
      s.veaOutbox.queryFilter = jest.fn().mockRejectedValue(new Error("rpc down"));
      s.fetchLatestClaimedEpoch.mockResolvedValue(undefined);
      await checkAndClaim(s.params);
      expect(s.handler.makeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("reports UNDECIDABLE when the claim cannot be funded", async () => {
      const s = setup();
      s.handler.makeClaim = jest.fn().mockRejectedValue(new CannotFundError("claim"));
      expect(await checkAndClaim(s.params)).toBe(s.handler);
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("takes the claimable epoch from chain time, not the host clock", async () => {
      const s = setup();
      delete s.params.now;
      const T = s.route.outbox.block("latest").timestamp;
      s.params.epoch = Math.floor(T / P) - 1;
      const dateNow = jest.spyOn(Date, "now").mockReturnValue((T + 3600) * 1000);
      try {
        await checkAndClaim(s.params);
      } finally {
        dateNow.mockRestore();
      }
      expect(s.handler.makeClaim).toHaveBeenCalledWith(SAVED);
    });

    it("devnet: advances the state when the outbox is behind, DONE otherwise", async () => {
      const s = setup();
      s.params.network = Network.DEVNET;
      s.veaOutbox.stateRoot = jest.fn().mockResolvedValue(OUTBOX_ROOT);
      s.veaInbox.snapshots = jest.fn().mockResolvedValue(SAVED);
      await checkAndClaim(s.params);
      expect(s.handler.devnetAdvanceState).toHaveBeenCalledWith(SAVED);
      s.veaOutbox.stateRoot = jest.fn().mockResolvedValue(SAVED);
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING, EpochOutcome.DONE]);
    });
  });

  describe("a passed epoch with no claim", () => {
    const boundary = Math.floor(NOW / P) * P; // (E+2)·P for E = CLAIMABLE - 1

    it("stays PENDING while the outbox read block is before (E+2)·P even though latest is past it", async () => {
      const s = setup();
      s.params.epoch = CLAIMABLE - 1;
      const outbox = createTwoChainRoute({ now: boundary + 120 }).outbox;
      expect(outbox.block("finalized").timestamp).toBeLessThan(boundary);
      s.params.veaOutboxProvider = outbox.provider;
      s.params.now = (boundary + 120) * 1000;
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("is DONE once the read block is at or past (E+2)·P", async () => {
      const s = setup();
      s.params.epoch = CLAIMABLE - 1;
      const outbox = createTwoChainRoute({ now: boundary + 200 }).outbox;
      s.params.veaOutboxProvider = outbox.provider;
      s.params.now = (boundary + 200) * 1000;
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });
  });

  describe("verifying a claim", () => {
    it("verifies our own claim: startVerification, then verifySnapshot, at the outbox read block's time", async () => {
      const s = setup();
      // During a finality stall the read block is latest - 64, not finalized.
      const finalized = withFinalizedLag(s, FINALITY_STALL_SECS + 600);
      const readBlock = s.route.outbox.block(s.route.outbox.resolve("latest") - OUTBOX_STALL_DEPTH_BLOCKS);
      expect(readBlock.timestamp).not.toBe(finalized.timestamp);

      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS });
      await checkAndClaim(s.params);
      expect(s.params.fetchSettledReadBlocks).not.toHaveBeenCalled();
      expect(s.handler.startVerification).toHaveBeenCalledWith(readBlock.timestamp);

      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS, timestampVerification: NOW - 100 });
      await checkAndClaim(s.params);
      expect(s.handler.verifySnapshot).toHaveBeenCalledWith(readBlock.timestamp);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING, EpochOutcome.PENDING]);
    });

    it("verifies a third party's claim only once it matches snapshots[E] at the settled inbox block", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct();
      await checkAndClaim(s.params);
      expect(s.veaInbox.snapshots).toHaveBeenCalledWith(CLAIMABLE, {
        blockTag: s.route.inbox.block("finalized").number,
      });
      expect(s.handler.startVerification).toHaveBeenCalledTimes(1);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("never verifies a third party's claim whose root differs from snapshots[E]; alerts instead", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({ stateRoot: "0x" + "ab".repeat(32) });
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
      expect(s.emitter.emit).toHaveBeenCalledWith(
        BotEvents.ALERT,
        expect.objectContaining({ level: "error", code: "claim_mismatch_unverified", epoch: CLAIMABLE })
      );
    });

    it("compares roots as bytes: a mixed-case root equal to snapshots[E] is verified", async () => {
      const s = setup();
      const root = "0x" + "ab".repeat(32);
      s.veaInbox.snapshots.mockImplementation(s.route.inbox.pinned(() => root));
      s.params.claim = makeClaimStruct({ stateRoot: "0x" + root.slice(2).toUpperCase() });
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).toHaveBeenCalledTimes(1);
    });

    it("is UNDECIDABLE for a third party's claim while the inbox read is not settled", async () => {
      const s = setup();
      (s.params.fetchSettledReadBlocks as jest.Mock).mockResolvedValue(null);
      s.params.claim = makeClaimStruct();
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("leaves a disputed claim to the challenger (PENDING, no verification)", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS, challenger: OTHER });
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });
  });

  describe("deposits", () => {
    it("withdraws our verified claim's deposit, never a third party's", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS, honest: ClaimHonestState.CLAIMER });
      await checkAndClaim(s.params);
      expect(s.handler.withdrawClaimDeposit).toHaveBeenCalledTimes(1);

      s.params.claim = makeClaimStruct({ honest: ClaimHonestState.CLAIMER });
      await checkAndClaim(s.params);
      expect(s.handler.withdrawClaimDeposit).toHaveBeenCalledTimes(1);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING, EpochOutcome.DONE]);
    });

    it("withdraws our claim through the escape hatch once the bridge has timed out", async () => {
      const s = setup();
      s.handler.isBridgeShutdown.mockResolvedValue(true);
      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS, challenger: OTHER });
      await checkAndClaim(s.params);
      expect(s.handler.withdrawClaimerEscapeHatch).toHaveBeenCalled();
      expect(s.handler.startVerification).not.toHaveBeenCalled();
      expect(s.emitter.emit).toHaveBeenCalledWith(
        BotEvents.ESCAPE_HATCH,
        expect.objectContaining({ party: "claimer", action: "detected", epoch: CLAIMABLE })
      );
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });
  });
});
