import { ethers } from "ethers";
import { checkAndClaim, CheckAndClaimParams } from "../../helpers/claimer";
import { createTwoChainRoute, TwoChainRoute } from "../../testUtils/twoChainFixture";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { resolveSettledReadBlocks } from "../../utils/arbToEthState";
import { EpochOutcome } from "../../utils/epochOutcome";
import { BotEvents } from "../../utils/botEvents";
import { CannotFundError } from "../../utils/transactionHandlers";
import { ClaimHonestState } from "../../utils/claim";
import { FINALITY_STALL_SECS, OUTBOX_STALL_DEPTH_BLOCKS } from "../../utils/arbToEthState";
import { resetBridgeShutdownAlerts } from "../../helpers/escapeHatch";

const CHAIN_ID = 10200;
const P = getBridgeConfig(CHAIN_ID).routeConfig[Network.TESTNET].epochPeriod;
// Half an epoch past a boundary, so the inbox `finalized` block (20 min behind) is already in the new epoch.
const NOW = Math.floor(1_760_000_000 / P) * P + P / 2;
const CLAIMABLE = Math.floor(NOW / P) - 1;
const SAVED = "0x" + "11".repeat(32);
const OUTBOX_ROOT = "0x" + "22".repeat(32);
const OUR_ADDRESS = "0x00000000000000000000000000000000000000aa";

const makeClaimStruct = (overrides: Record<string, unknown> = {}): any => ({
  stateRoot: SAVED,
  claimer: "0x00000000000000000000000000000000000000c1",
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
  const veaInbox = {
    snapshots: jest.fn(route.inbox.pinned(() => SAVED)),
  };
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
    fetchSettledReadBlocks: jest.fn(async (p: any) => ({
      inboxBlock: route.inbox.block("finalized").number,
      outboxBlock: route.outbox.block("finalized").number,
    })),
    now: NOW * 1000,
    reportOutcome: (outcome) => outcomes.push(outcome),
  };
  return { route, params, handler, outcomes, emitter, veaOutbox, veaInbox, scannedRanges, fetchLatestClaimedEpoch };
};

/**
 * Replace the outbox provider's `finalized` block with one `lagSecs` behind latest (the rest of
 * the chain stays the fixture's), so the outbox read block is under the test's control.
 */
const withFinalizedLag = (s: Setup, lagSecs: number) => {
  const chain = s.route.outbox;
  const lagBlocks = Math.ceil(lagSecs / chain.options.secondsPerBlock);
  const provider = {
    ...chain.provider,
    getBlock: async (tag: any) => chain.block(tag === "finalized" ? chain.resolve("latest") - lagBlocks : tag),
  };
  s.params.veaOutboxProvider = provider;
  return { provider, finalized: chain.block(chain.resolve("latest") - lagBlocks) };
};

describe("actions: claimer", () => {
  beforeEach(() => {
    resetBridgeShutdownAlerts();
  });

  describe("PRD 1.2 (BR-5): makeClaim reads each chain at its own blocks on chain 10200", () => {
    it("passes the Sepolia router as l1Provider and Chiado as outboxProvider to resolveSettledReadBlocks", async () => {
      const s = setup();
      await checkAndClaim(s.params);

      expect(s.params.fetchSettledReadBlocks).toHaveBeenCalledTimes(1);
      const args = (s.params.fetchSettledReadBlocks as jest.Mock).mock.calls[0][0];
      expect(args.l1Provider).toBe(s.route.router.provider);
      expect(args.outboxProvider).toBe(s.route.outbox.provider);
      expect(args.inboxProvider).toBe(s.route.inbox.provider);
    });

    it("reads stateRoot and scans Claimed on Chiado blocks with the real resolveSettledReadBlocks", async () => {
      const s = setup();
      const fetchBlocksAndCheckFinality = jest.fn(async (l1: any, inbox: any) => {
        // The finality check runs against Arbitrum's L1, never against Chiado.
        expect(l1).toBe(s.route.router.provider);
        expect(inbox).toBe(s.route.inbox.provider);
        return [s.route.inbox.block("finalized"), s.route.router.block("finalized"), false, false] as any;
      });
      s.params.fetchSettledReadBlocks = resolveSettledReadBlocks;
      s.params.fetchBlocksAndCheckFinality = fetchBlocksAndCheckFinality;

      await checkAndClaim(s.params);

      expect(fetchBlocksAndCheckFinality).toHaveBeenCalled();
      // The fixture throws WrongChainBlockError on a Sepolia block number, so reaching the claim
      // proves stateRoot and every Claimed chunk were pinned to Chiado blocks.
      const stateRootTag = s.veaOutbox.stateRoot.mock.calls[0][0].blockTag;
      expect(() => s.route.outbox.assertOwnBlock(stateRootTag)).not.toThrow();
      expect(s.scannedRanges.length).toBeGreaterThan(0);
      const readHead = s.route.outbox.block("finalized").number;
      expect(Math.max(...s.scannedRanges.map((r) => r[1]))).toBe(readHead);
      expect(s.handler.makeClaim).toHaveBeenCalledWith(SAVED);
    });
  });

  describe("PRD 1.4: a quiet bridge does not stop the claimer", () => {
    it("falls back to the indexer when the Claimed lookback is empty", async () => {
      const s = setup();
      s.fetchLatestClaimedEpoch.mockResolvedValue({ stateRoot: SAVED });

      await checkAndClaim(s.params);

      expect(s.fetchLatestClaimedEpoch).toHaveBeenCalledWith("0xoutbox", CHAIN_ID);
      // The indexer says SAVED was already claimed: no duplicate claim.
      expect(s.handler.makeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("claims on savedSnapshot != outboxStateRoot alone when neither source has a claim", async () => {
      const s = setup();

      await checkAndClaim(s.params);

      expect(s.fetchLatestClaimedEpoch).toHaveBeenCalled();
      expect(s.handler.makeClaim).toHaveBeenCalledWith(SAVED);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("does not claim when no claim is found and the outbox already holds the snapshot", async () => {
      const s = setup();
      s.veaOutbox.stateRoot = jest.fn(s.route.outbox.pinned(() => SAVED));

      await checkAndClaim(s.params);

      expect(s.handler.makeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("uses a Claimed log in the lookback without asking the indexer", async () => {
      const head = createTwoChainRoute({ now: NOW }).outbox.block("finalized").number;
      const s = setup({ claimedLogs: [{ blockNumber: head - 10, data: SAVED }] });

      await checkAndClaim(s.params);

      expect(s.fetchLatestClaimedEpoch).not.toHaveBeenCalled();
      expect(s.handler.makeClaim).not.toHaveBeenCalled();
    });

    it("reports UNDECIDABLE when the scan and the indexer both fail", async () => {
      const s = setup();
      s.veaOutbox.queryFilter = jest.fn().mockRejectedValue(new Error("rpc down"));
      s.fetchLatestClaimedEpoch.mockRejectedValue(new Error("indexer down"));

      const result = await checkAndClaim(s.params);

      expect(result).toBeNull();
      expect(s.handler.makeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });
  });

  describe("PRD 4.2 (BR-7) with [L11] (a): chain time decides the claimable epoch", () => {
    it("checkAndClaim without now claims floor(T / P) - 1 for an outbox latest block at T", async () => {
      const s = setup();
      delete s.params.now;
      const T = s.route.outbox.block("latest").timestamp;
      s.params.epoch = Math.floor(T / P) - 1;
      // A host clock an hour off must not matter.
      const dateNow = jest.spyOn(Date, "now").mockReturnValue((T + 3600) * 1000);
      try {
        await checkAndClaim(s.params);
      } finally {
        dateNow.mockRestore();
      }
      expect(s.handler.makeClaim).toHaveBeenCalledWith(SAVED);
    });

    it("checkAndClaim without now treats floor(T / P) - 2 as passed", async () => {
      const s = setup();
      delete s.params.now;
      const T = s.route.outbox.block("latest").timestamp;
      s.params.epoch = Math.floor(T / P) - 2;
      const dateNow = jest.spyOn(Date, "now").mockReturnValue((T - 3600) * 1000);
      try {
        await checkAndClaim(s.params);
      } finally {
        dateNow.mockRestore();
      }
      expect(s.handler.makeClaim).not.toHaveBeenCalled();
      expect(s.emitter.emit).toHaveBeenCalledWith(BotEvents.CLAIM_EPOCH_PASSED, s.params.epoch);
    });
  });

  describe("PRD 2.2 (BR-2): every claimer path reports an outcome", () => {
    it("UNDECIDABLE when the epoch is not settled", async () => {
      const s = setup();
      s.params.fetchSettledReadBlocks = jest.fn().mockResolvedValue(null);
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("DONE when no snapshot was saved", async () => {
      const s = setup();
      s.veaInbox.snapshots = jest.fn(s.route.inbox.pinned(() => ethers.ZeroHash));
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("PENDING when a claim is sent", async () => {
      const s = setup();
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("DONE when the claim window has passed with no claim", async () => {
      const s = setup();
      s.params.epoch = CLAIMABLE - 1;
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("UNDECIDABLE for an epoch that has not ended yet", async () => {
      const s = setup();
      s.params.epoch = CLAIMABLE + 1;
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("PENDING while withdrawing the deposit of a verified claim", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS, honest: ClaimHonestState.CLAIMER });
      await checkAndClaim(s.params);
      expect(s.handler.withdrawClaimDeposit).toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("DONE when the challenger won", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({ honest: ClaimHonestState.CHALLENGER });
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("PENDING while a claim is in dispute", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({
        claimer: OUR_ADDRESS,
        challenger: "0x00000000000000000000000000000000000000c2",
      });
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("PENDING while starting verification and while verifying", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS });
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).toHaveBeenCalled();
      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS, timestampVerification: NOW - 100 });
      await checkAndClaim(s.params);
      expect(s.handler.verifySnapshot).toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING, EpochOutcome.PENDING]);
    });

    it("devnet: PENDING when advancing state, DONE when nothing to advance", async () => {
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

  describe("PRD 4.8 runtime / C1 (BR-11): funding", () => {
    it("reports UNDECIDABLE when the handler cannot fund the claim", async () => {
      const s = setup();
      s.handler.makeClaim = jest.fn().mockRejectedValue(new CannotFundError("claim"));
      const result = await checkAndClaim(s.params);
      expect(result).toBe(s.handler);
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });
  });

  describe("PRD 3.3 (BR-11): claimer escape hatch", () => {
    it("withdraws our claim deposit through the escape hatch once the bridge has timed out", async () => {
      const s = setup();
      s.handler.isBridgeShutdown.mockResolvedValue(true);
      s.params.claim = makeClaimStruct({
        claimer: OUR_ADDRESS,
        challenger: "0x00000000000000000000000000000000000000c2",
      });
      await checkAndClaim(s.params);
      expect(s.handler.withdrawClaimerEscapeHatch).toHaveBeenCalled();
      expect(s.handler.startVerification).not.toHaveBeenCalled();
      expect(s.emitter.emit).toHaveBeenCalledWith(
        BotEvents.ESCAPE_HATCH,
        expect.objectContaining({ party: "claimer", action: "detected", epoch: CLAIMABLE })
      );
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("leaves another claimer's deposit alone and reports DONE", async () => {
      const s = setup();
      s.handler.isBridgeShutdown.mockResolvedValue(true);
      s.params.claim = makeClaimStruct();
      await checkAndClaim(s.params);
      expect(s.handler.withdrawClaimerEscapeHatch).not.toHaveBeenCalled();
      expect(s.handler.startVerification).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });
  });

  it("builds its own handler with the router provider when none is passed (direct callers)", async () => {
    const s = setup();
    let built: any;
    s.params.transactionHandler = null;
    s.params.fetchTransactionHandler = jest.fn().mockReturnValue(function Handler(this: any, opts: any) {
      built = opts;
      return s.handler;
    }) as any;
    await checkAndClaim(s.params);
    expect(built.veaRouterProvider).toBe(s.route.router.provider);
  });

  describe("run-001 #4: verification timing uses the outbox read block", () => {
    it("passes getOutboxReadBlock's timestamp (latest minus 64 during a finality stall), not finalized", async () => {
      const s = setup();
      const { finalized } = withFinalizedLag(s, FINALITY_STALL_SECS + 600);
      const readBlock = s.route.outbox.block(s.route.outbox.resolve("latest") - OUTBOX_STALL_DEPTH_BLOCKS);
      expect(readBlock.timestamp).not.toBe(finalized.timestamp);

      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS });
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).toHaveBeenCalledWith(readBlock.timestamp);

      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS, timestampVerification: NOW - 100 });
      await checkAndClaim(s.params);
      expect(s.handler.verifySnapshot).toHaveBeenCalledWith(readBlock.timestamp);
    });
  });

  describe("run-001 #8 / #9 (amended after run 004): third-party claims are verified only after the snapshot check; deposits stay ours-only", () => {
    it("verifies a third party's claim once it matches snapshots[E] at the settled inbox block (PENDING)", async () => {
      // Operator decision after run 004: every unchallenged claim is verified, ours or not, but a
      // third party's only after the snapshot check; that is what keeps latestVerifiedEpoch moving.
      const s = setup();
      s.params.claim = makeClaimStruct();
      await checkAndClaim(s.params);
      expect(s.params.fetchSettledReadBlocks).toHaveBeenCalledTimes(1);
      expect(s.veaInbox.snapshots).toHaveBeenCalledWith(CLAIMABLE, {
        blockTag: s.route.inbox.block("finalized").number,
      });
      expect(s.handler.startVerification).toHaveBeenCalledTimes(1);
      s.params.claim = makeClaimStruct({ timestampVerification: NOW - 100 });
      await checkAndClaim(s.params);
      expect(s.handler.verifySnapshot).toHaveBeenCalledTimes(1);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING, EpochOutcome.PENDING]);
    });

    it("never verifies a third party's claim whose root differs from snapshots[E]; alerts instead", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({ stateRoot: "0x" + "ab".repeat(32) });
      const result = await checkAndClaim(s.params);
      expect(s.handler.startVerification).not.toHaveBeenCalled();
      expect(s.handler.verifySnapshot).not.toHaveBeenCalled();
      expect(result).toBe(s.handler);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
      expect(s.emitter.emit).toHaveBeenCalledWith(
        BotEvents.ALERT,
        expect.objectContaining({ level: "error", code: "claim_mismatch_unverified", epoch: CLAIMABLE })
      );
    });

    it("compares roots as bytes: a mixed-case root equal to snapshots[E] is verified, not flagged", async () => {
      const s = setup();
      const root = "0x" + "ab".repeat(32);
      s.veaInbox.snapshots.mockImplementation(s.route.inbox.pinned(() => root));
      s.params.claim = makeClaimStruct({ stateRoot: "0x" + root.slice(2).toUpperCase() });
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).toHaveBeenCalledTimes(1);
      expect(s.emitter.emit).not.toHaveBeenCalledWith(
        BotEvents.ALERT,
        expect.objectContaining({ code: "claim_mismatch_unverified" })
      );
    });

    it("UNDECIDABLE for a third party's claim while the inbox read is not settled", async () => {
      const s = setup();
      (s.params.fetchSettledReadBlocks as jest.Mock).mockResolvedValue(null);
      s.params.claim = makeClaimStruct();
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("verifies our own claim without the snapshot check", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS });
      await checkAndClaim(s.params);
      expect(s.params.fetchSettledReadBlocks).not.toHaveBeenCalled();
      expect(s.handler.startVerification).toHaveBeenCalledTimes(1);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("treats a claim as a third party's when the signer is unknown (snapshot check, then verify)", async () => {
      const s = setup();
      s.handler.getSignerAddress = jest.fn().mockReturnValue(undefined);
      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS });
      await checkAndClaim(s.params);
      expect(s.params.fetchSettledReadBlocks).toHaveBeenCalledTimes(1);
      expect(s.handler.startVerification).toHaveBeenCalledTimes(1);
    });

    it("matches our signer case-insensitively", async () => {
      const s = setup();
      s.handler.getSignerAddress = jest.fn().mockReturnValue(OUR_ADDRESS.toUpperCase().replace("0X", "0x"));
      s.params.claim = makeClaimStruct({ claimer: OUR_ADDRESS });
      await checkAndClaim(s.params);
      expect(s.handler.startVerification).toHaveBeenCalled();
    });

    it("does not withdraw the deposit of a third party's verified claim", async () => {
      const s = setup();
      s.params.claim = makeClaimStruct({ honest: ClaimHonestState.CLAIMER });
      const result = await checkAndClaim(s.params);
      expect(s.handler.withdrawClaimDeposit).not.toHaveBeenCalled();
      expect(result).toBeNull();
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });
  });

  describe("run-001 #10: DONE for an unclaimed epoch only from the outbox read block", () => {
    it("PENDING when latest is past (E+2)·P but the read block is not", async () => {
      const s = setup();
      const boundary = Math.floor(NOW / P) * P; // (E+2)·P for E = CLAIMABLE - 1
      s.params.epoch = CLAIMABLE - 1;
      // Latest is 120 s past the boundary; the read block (finalized, 160 s behind, no stall) is before it.
      const outbox = createTwoChainRoute({ now: boundary + 120 }).outbox;
      expect(outbox.block("finalized").timestamp).toBeLessThan(boundary);
      s.params.veaOutboxProvider = outbox.provider;
      s.params.now = (boundary + 120) * 1000;
      await checkAndClaim(s.params);
      expect(s.emitter.emit).toHaveBeenCalledWith(BotEvents.CLAIM_EPOCH_PASSED, CLAIMABLE - 1);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("DONE once the read block is at or past (E+2)·P", async () => {
      const s = setup();
      const boundary = Math.floor(NOW / P) * P;
      s.params.epoch = CLAIMABLE - 1;
      const outbox = createTwoChainRoute({ now: boundary + 200 }).outbox;
      expect(outbox.block("finalized").timestamp).toBeGreaterThanOrEqual(boundary);
      s.params.veaOutboxProvider = outbox.provider;
      s.params.now = (boundary + 200) * 1000;
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("UNDECIDABLE when the read block cannot be read", async () => {
      const s = setup();
      s.params.epoch = CLAIMABLE - 1;
      s.params.veaOutboxProvider = {
        getBlock: async (tag: any) => {
          if (tag === "latest") return s.route.outbox.block("latest");
          throw new Error("rpc down");
        },
      } as any;
      await checkAndClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });
  });

  describe("run-001 #16: a failed Claimed scan plus an empty indexer answer", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a record without a state root", { stateRoot: undefined }],
    ])("reports UNDECIDABLE and does not claim when the indexer answers %s", async (_name, answer) => {
      const s = setup();
      s.veaOutbox.queryFilter = jest.fn().mockRejectedValue(new Error("getLogs failed"));
      s.fetchLatestClaimedEpoch.mockResolvedValue(answer);
      await checkAndClaim(s.params);
      expect(s.handler.makeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("still claims when the scan succeeded with an empty window and the indexer is empty", async () => {
      const s = setup();
      s.fetchLatestClaimedEpoch.mockResolvedValue(undefined);
      await checkAndClaim(s.params);
      expect(s.handler.makeClaim).toHaveBeenCalledWith(SAVED);
    });
  });

  describe("run-001 #13: the bridge_shutdown alert", () => {
    it("is emitted once per route and epoch across cycles, again for another epoch", async () => {
      const s = setup();
      s.handler.isBridgeShutdown.mockResolvedValue(true);
      s.params.claim = makeClaimStruct();
      await checkAndClaim(s.params);
      await checkAndClaim(s.params);
      await checkAndClaim({ ...s.params, epoch: CLAIMABLE - 1 });
      const alerts = s.emitter.emit.mock.calls.filter(
        ([event, payload]) => event === BotEvents.ALERT && payload?.code === "bridge_shutdown"
      );
      expect(alerts.map(([, payload]) => payload.epoch)).toEqual([CLAIMABLE, CLAIMABLE - 1]);
      expect(alerts[0][1]).toEqual(
        expect.objectContaining({ chainId: CHAIN_ID, network: Network.TESTNET, level: "error" })
      );
    });
  });
});
