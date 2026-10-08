import { ethers } from "ethers";
import { challengeAndResolveClaim, ChallengeAndResolveClaimParams } from "../../helpers/validator";
import { createTwoChainRoute, TwoChainRoute } from "../../testUtils/twoChainFixture";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { EpochOutcome } from "../../utils/epochOutcome";
import { BotEvents } from "../../utils/botEvents";
import { CannotFundError, ArbToGnosisTransactionHandler, getTransactionHandler } from "../../utils/transactionHandlers";
import { ClaimHonestState } from "../../utils/claim";
import { messageExecutor } from "../../utils/arbMsgExecutor";
import { resolveSettledReadBlocks } from "../../utils/arbToEthState";
import { resetBridgeShutdownAlerts } from "../../helpers/escapeHatch";

jest.mock("../../utils/arbMsgExecutor", () => ({
  messageExecutor: jest.fn(),
  getMessageStatus: jest.fn(),
}));

const CHAIN_ID = 10200;
const P = getBridgeConfig(CHAIN_ID).routeConfig[Network.TESTNET].epochPeriod;
const NOW = Math.floor(1_760_000_000 / P) * P + P / 2;
const EPOCH = Math.floor(NOW / P) - 1;
const HONEST_ROOT = "0x" + "11".repeat(32);
const FRAUD_ROOT = "0x" + "66".repeat(32);
const OUR_ADDRESS = "0x00000000000000000000000000000000000000aa";
const OTHER = "0x00000000000000000000000000000000000000c1";

const claimStruct = (overrides: Record<string, unknown> = {}): any => ({
  stateRoot: FRAUD_ROOT,
  claimer: OTHER,
  timestampClaimed: NOW - P / 4,
  timestampVerification: 0,
  blocknumberVerification: 0,
  honest: ClaimHonestState.NONE,
  challenger: ethers.ZeroAddress,
  ...overrides,
});

const resolveState = (overrides: Record<string, unknown> = {}): any => ({
  sendSnapshot: { status: false, txHash: "" },
  execution: { status: 0, txHash: "" },
  ...overrides,
});

const setup = (claim: any = claimStruct()) => {
  const route = createTwoChainRoute({ now: NOW });
  const veaInbox = { snapshots: jest.fn(route.inbox.pinned(() => HONEST_ROOT)) };
  const claimHashAt = jest.fn((_block: number | "latest", _epoch: number) => ethers.ZeroHash);
  const veaOutbox = { claimHashes: jest.fn(route.outbox.pinned(claimHashAt)) };
  const handler: any = {
    network: Network.TESTNET,
    transactions: {},
    claim: null,
    challengeClaim: jest.fn().mockResolvedValue(undefined),
    sendSnapshot: jest.fn().mockResolvedValue(undefined),
    resolveChallengedClaim: jest.fn().mockResolvedValue(undefined),
    withdrawChallengeDeposit: jest.fn().mockResolvedValue(undefined),
    isBridgeShutdown: jest.fn().mockResolvedValue(false),
    getSignerAddress: jest.fn().mockReturnValue(OUR_ADDRESS),
    withdrawChallengerEscapeHatch: jest.fn().mockResolvedValue(undefined),
  };
  const outcomes: EpochOutcome[] = [];
  const emitter = { emit: jest.fn() };
  // Behaves like getClaimResolveState's outbox read: claimHashes at the outbox head block.
  const fetchClaimResolveState = jest.fn(async (p: any) => {
    const head = await p.veaOutboxProvider.getBlock(p.headBlockTag ?? "finalized");
    await p.veaOutbox.claimHashes(p.epoch, { blockTag: head.number });
    return resolveState();
  });
  const params: ChallengeAndResolveClaimParams = {
    chainId: CHAIN_ID,
    claim,
    epoch: EPOCH,
    epochPeriod: P,
    veaInbox,
    veaInboxProvider: route.inbox.provider,
    veaOutboxProvider: route.outbox.provider,
    veaRouterProvider: route.router.provider,
    veaOutbox,
    transactionHandler: handler,
    emitter: emitter as any,
    fetchClaimResolveState: fetchClaimResolveState as any,
    fetchSettledReadBlocks: jest.fn(async () => ({
      inboxBlock: route.inbox.block("finalized").number,
      outboxBlock: route.outbox.block("finalized").number,
    })),
    reportOutcome: (outcome) => outcomes.push(outcome),
  };
  return { route, params, handler, outcomes, emitter, veaOutbox, veaInbox, claimHashAt, fetchClaimResolveState };
};

/** Move all three chains of the route forward by `secs` of chain time (one watcher cycle is 120 s). */
const advanceChains = (route: TwoChainRoute, secs: number) => {
  for (const chain of [route.inbox, route.outbox, route.router]) chain.advance(secs / chain.options.secondsPerBlock);
};

describe("actions: challenger", () => {
  beforeEach(() => {
    resetBridgeShutdownAlerts();
  });

  describe("PRD 1.3 (BR-5): the resolve flow reads the outbox on its own chain", () => {
    it("passes the Chiado provider as veaOutboxProvider and the Sepolia router as l1Provider to getClaimResolveState", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));

      await challengeAndResolveClaim(s.params);

      expect(s.fetchClaimResolveState).toHaveBeenCalledTimes(1);
      const args = s.fetchClaimResolveState.mock.calls[0][0];
      expect(args.veaOutboxProvider).toBe(s.route.outbox.provider);
      expect(args.l1Provider).toBe(s.route.router.provider);
      // The claimHashes read went to a Chiado block (the fixture throws on a Sepolia one).
      const [block] = s.claimHashAt.mock.calls[0];
      expect(() => s.route.outbox.assertOwnBlock(block as number)).not.toThrow();
      expect(s.handler.sendSnapshot).toHaveBeenCalled();
    });

    it("passes the router as l1Provider and Chiado as outboxProvider to resolveSettledReadBlocks", async () => {
      const s = setup();
      await challengeAndResolveClaim(s.params);
      const args = (s.params.fetchSettledReadBlocks as jest.Mock).mock.calls[0][0];
      expect(args.l1Provider).toBe(s.route.router.provider);
      expect(args.outboxProvider).toBe(s.route.outbox.provider);
    });
  });

  describe("PRD 2.2 (BR-2): every challenger path reports an outcome", () => {
    it("no claim, window still open on the outbox read block: PENDING", async () => {
      const s = setup(null);
      // Read block (finalized) is inside [(E+1)P, (E+2)P).
      await challengeAndResolveClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("no claim, window closed and claimHashes zero at the same Chiado read block: DONE", async () => {
      const s = setup(null);
      s.params.epoch = EPOCH - 2;
      await challengeAndResolveClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
      const [block] = s.claimHashAt.mock.calls[0];
      expect(block).toBe(s.route.outbox.block("finalized").number);
    });

    it("no claim from getClaim but a claim hash at the read block (late claim): PENDING", async () => {
      const s = setup(null);
      s.params.epoch = EPOCH - 2;
      s.claimHashAt.mockReturnValue("0x" + "ab".repeat(32));
      await challengeAndResolveClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("no claim and the read fails: UNDECIDABLE", async () => {
      const s = setup(null);
      s.params.epoch = EPOCH - 2;
      s.claimHashAt.mockImplementation(() => {
        throw new Error("rpc down");
      });
      await challengeAndResolveClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("not settled: UNDECIDABLE and no read", async () => {
      const s = setup();
      s.params.fetchSettledReadBlocks = jest.fn().mockResolvedValue(null);
      await challengeAndResolveClaim(s.params);
      expect(s.veaInbox.snapshots).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("fraudulent claim: challenges and reports PENDING", async () => {
      const s = setup();
      await challengeAndResolveClaim(s.params);
      expect(s.handler.challengeClaim).toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("our own matching unverified claim: no challenge, PENDING until it is verified", async () => {
      const s = setup(claimStruct({ stateRoot: HONEST_ROOT, claimer: OUR_ADDRESS }));
      await challengeAndResolveClaim(s.params);
      expect(s.handler.challengeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("claimer won: DONE", async () => {
      const s = setup(claimStruct({ stateRoot: HONEST_ROOT, honest: ClaimHonestState.CLAIMER }));
      await challengeAndResolveClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("challenger won: withdraws and reports PENDING", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS, honest: ClaimHonestState.CHALLENGER }));
      await challengeAndResolveClaim(s.params);
      expect(s.handler.withdrawChallengeDeposit).toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it.each([
      ["snapshot not sent", resolveState(), "sendSnapshot"],
      ["sent, not executable yet", resolveState({ sendSnapshot: { status: true, txHash: "0xsent" } }), null],
      [
        "sent and executable",
        resolveState({ sendSnapshot: { status: true, txHash: "0xsent" }, execution: { status: 1, txHash: "" } }),
        "resolveChallengedClaim",
      ],
    ])("dispute step (%s): PENDING", async (_name, state, step) => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      s.params.fetchClaimResolveState = jest.fn().mockResolvedValue(state);
      await challengeAndResolveClaim(s.params);
      if (step) expect(s.handler[step]).toHaveBeenCalled();
      expect(s.handler.challengeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });
  });

  describe("run-001 #14 with [L28]: no FAILED_RESOLUTION from this lane", () => {
    it("never reads failedResolution, emits no FAILED_RESOLUTION and passes no headBlockTag", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      let failedResolutionReads = 0;
      const state = resolveState({
        sendSnapshot: { status: true, txHash: "0xsent" },
        execution: { status: 1, txHash: "" },
      });
      Object.defineProperty(state, "failedResolution", {
        enumerable: true,
        get: () => {
          failedResolutionReads++;
          return { detected: true, txHash: "0xfailed" };
        },
      });
      s.params.fetchClaimResolveState = jest.fn().mockResolvedValue(state);

      await challengeAndResolveClaim(s.params);
      await challengeAndResolveClaim(s.params);

      expect(failedResolutionReads).toBe(0);
      const events = s.emitter.emit.mock.calls.map(([event]) => event);
      expect(events).not.toContain(BotEvents.FAILED_RESOLUTION);
      expect(s.handler.sendSnapshot).not.toHaveBeenCalled();
      expect(s.handler.resolveChallengedClaim).toHaveBeenCalledWith("0xsent");
      for (const [args] of (s.params.fetchClaimResolveState as jest.Mock).mock.calls) {
        expect(args).not.toHaveProperty("headBlockTag");
      }
    });

    it("an executed ticket (status 2) with honest 0 sends nothing: no re-send, no withdrawal ([L23], deferred PRD 4.4 for Gnosis)", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      s.params.fetchClaimResolveState = jest
        .fn()
        .mockResolvedValue(
          resolveState({ sendSnapshot: { status: true, txHash: "0xsent" }, execution: { status: 2 } })
        );
      await challengeAndResolveClaim(s.params);
      expect(s.handler.sendSnapshot).not.toHaveBeenCalled();
      expect(s.handler.resolveChallengedClaim).not.toHaveBeenCalled();
      expect(s.handler.withdrawChallengeDeposit).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });
  });

  describe("run-001 #2 with [L16]: sendSnapshot is sent once", () => {
    it.each([
      ["30 minutes ahead", 30 * 60],
      ["30 minutes behind", -30 * 60],
    ])("one send across 20 cycles with the host clock %s", async (_name, skewSecs) => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      // Any read of the handler's transaction records (broadcastedTimestamp included) is counted.
      let transactionReads = 0;
      s.handler.transactions = new Proxy({}, { get: () => (transactionReads++, undefined) });
      const sentAtInboxBlock: number[] = [];
      s.handler.sendSnapshot = jest.fn(async () => {
        sentAtInboxBlock.push(s.route.inbox.resolve("latest"));
      });
      // The claims lane's lookup after [L16]: it searches to the inbox `latest` block, so our send
      // is adopted as soon as it is mined; the ticket becomes executable only later.
      let executable = false;
      s.params.fetchClaimResolveState = jest.fn(async (p: any) => {
        const latest = (await p.veaInboxProvider.getBlock("latest")).number;
        const adopted = sentAtInboxBlock.some((block) => block <= latest);
        return adopted
          ? resolveState({
              sendSnapshot: { status: true, txHash: "0xours" },
              execution: { status: executable ? 1 : 0 },
            })
          : resolveState();
      }) as any;

      jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask", "setImmediate"] });
      try {
        for (let cycle = 0; cycle < 20; cycle++) {
          const chainNow = s.route.outbox.block("latest").timestamp;
          jest.setSystemTime((chainNow + skewSecs) * 1000);
          if (cycle === 19) executable = true;
          await challengeAndResolveClaim(s.params);
          // The next cycle starts 2 minutes later; the send is mined one inbox block later.
          advanceChains(s.route, 120);
        }
      } finally {
        jest.useRealTimers();
      }

      expect(s.handler.sendSnapshot).toHaveBeenCalledTimes(1);
      expect(s.handler.resolveChallengedClaim).toHaveBeenCalledTimes(1);
      expect(s.handler.resolveChallengedClaim).toHaveBeenCalledWith("0xours");
      expect(transactionReads).toBe(0);
      expect(s.outcomes).toEqual(Array(20).fill(EpochOutcome.PENDING));
    });

    it("re-sends while no ticket is adopted", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      s.params.fetchClaimResolveState = jest.fn().mockResolvedValue(resolveState());
      await challengeAndResolveClaim(s.params);
      await challengeAndResolveClaim(s.params);
      expect(s.handler.sendSnapshot).toHaveBeenCalledTimes(2);
    });
  });

  describe("run-001 #5: recovery runs before the settled-read gate", () => {
    const failingSettledReads = () => jest.fn().mockRejectedValue(new Error("inbox rpc down"));

    it("withdraws our challenge deposit through the escape hatch when the inbox and L1 reads fail", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      s.handler.isBridgeShutdown.mockResolvedValue(true);
      s.params.fetchSettledReadBlocks = failingSettledReads();
      await challengeAndResolveClaim(s.params);
      expect(s.handler.withdrawChallengerEscapeHatch).toHaveBeenCalled();
      expect(s.params.fetchSettledReadBlocks).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("withdraws our won challenge deposit when the settled reads would fail", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS, honest: ClaimHonestState.CHALLENGER }));
      s.params.fetchSettledReadBlocks = failingSettledReads();
      await challengeAndResolveClaim(s.params);
      expect(s.handler.withdrawChallengeDeposit).toHaveBeenCalled();
      expect(s.params.fetchSettledReadBlocks).not.toHaveBeenCalled();
    });

    it("still gates the challenge on the settled reads while the bridge runs", async () => {
      const s = setup();
      s.params.fetchSettledReadBlocks = jest.fn().mockResolvedValue(null);
      await challengeAndResolveClaim(s.params);
      expect(s.handler.isBridgeShutdown).toHaveBeenCalled();
      expect(s.handler.challengeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });
  });

  describe("run-001 #9: deposits are withdrawn only for our signer", () => {
    it("does not withdraw when another challenger won", async () => {
      const s = setup(claimStruct({ challenger: OTHER, honest: ClaimHonestState.CHALLENGER }));
      const result = await challengeAndResolveClaim(s.params);
      expect(s.handler.withdrawChallengeDeposit).not.toHaveBeenCalled();
      expect(result).toBeNull();
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("does not withdraw when the signer is unknown", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS, honest: ClaimHonestState.CHALLENGER }));
      s.handler.getSignerAddress.mockReturnValue(undefined);
      await challengeAndResolveClaim(s.params);
      expect(s.handler.withdrawChallengeDeposit).not.toHaveBeenCalled();
    });
  });

  describe("run-001 #11: a third party's matching claim", () => {
    it("reports DONE: there is nothing to challenge", async () => {
      const s = setup(claimStruct({ stateRoot: HONEST_ROOT, claimer: OTHER }));
      const result = await challengeAndResolveClaim(s.params);
      expect(s.handler.challengeClaim).not.toHaveBeenCalled();
      expect(result).toBeNull();
      // The snapshot was read at the settled inbox block.
      expect(s.veaInbox.snapshots).toHaveBeenCalledWith(EPOCH, {
        blockTag: s.route.inbox.block("finalized").number,
      });
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });
  });

  describe("run-001 #13: the bridge_shutdown alert", () => {
    it("is emitted once per route and epoch across cycles, again for another epoch", async () => {
      const s = setup();
      s.handler.isBridgeShutdown.mockResolvedValue(true);
      await challengeAndResolveClaim(s.params);
      await challengeAndResolveClaim(s.params);
      await challengeAndResolveClaim(s.params);
      await challengeAndResolveClaim({ ...s.params, epoch: EPOCH - 1 });
      const alerts = s.emitter.emit.mock.calls.filter(
        ([event, payload]) => event === BotEvents.ALERT && payload?.code === "bridge_shutdown"
      );
      expect(alerts.map(([, payload]) => payload.epoch)).toEqual([EPOCH, EPOCH - 1]);
      expect(s.outcomes).toEqual(Array(4).fill(EpochOutcome.DONE));
    });

    it("is keyed by route: the same epoch on another network alerts again", async () => {
      const s = setup();
      s.handler.isBridgeShutdown.mockResolvedValue(true);
      await challengeAndResolveClaim(s.params);
      s.handler.network = Network.DEVNET;
      await challengeAndResolveClaim(s.params);
      const alerts = s.emitter.emit.mock.calls.filter(
        ([event, payload]) => event === BotEvents.ALERT && payload?.code === "bridge_shutdown"
      );
      expect(alerts.map(([, payload]) => payload.network)).toEqual([Network.TESTNET, Network.DEVNET]);
    });
  });

  describe("PRD 3.3 (BR-11): challenger escape hatch", () => {
    it("withdraws our challenge deposit through the escape hatch once the bridge has timed out", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      s.handler.isBridgeShutdown.mockResolvedValue(true);
      await challengeAndResolveClaim(s.params);
      expect(s.handler.withdrawChallengerEscapeHatch).toHaveBeenCalled();
      expect(s.handler.sendSnapshot).not.toHaveBeenCalled();
      expect(s.emitter.emit).toHaveBeenCalledWith(
        BotEvents.ESCAPE_HATCH,
        expect.objectContaining({ party: "challenger", action: "detected", epoch: EPOCH, chainId: CHAIN_ID })
      );
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("does not challenge into a shut-down bridge (the dispute could never resolve)", async () => {
      const s = setup();
      s.handler.isBridgeShutdown.mockResolvedValue(true);
      await challengeAndResolveClaim(s.params);
      expect(s.handler.challengeClaim).not.toHaveBeenCalled();
      expect(s.handler.withdrawChallengerEscapeHatch).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
    });
  });

  describe("PRD 4.8 runtime / C1 (BR-11): funding", () => {
    it("reports UNDECIDABLE when the challenge cannot be funded", async () => {
      const s = setup();
      s.handler.challengeClaim = jest.fn().mockRejectedValue(new CannotFundError("challenge"));
      const result = await challengeAndResolveClaim(s.params);
      expect(result).toBe(s.handler);
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });
  });

  it("a challenged 10200 epoch executes the snapshot through the Sepolia router (real handler)", async () => {
    const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
    s.params.fetchClaimResolveState = jest
      .fn()
      .mockResolvedValue(resolveState({ sendSnapshot: { status: true, txHash: "0xsent" }, execution: { status: 1 } }));
    // The handler as the helper builds it for a direct caller (no handler passed).
    s.params.transactionHandler = null;
    const outboxContract: any = {
      runner: { address: OUR_ADDRESS },
      latestVerifiedEpoch: jest.fn().mockResolvedValue(BigInt(EPOCH - 1)),
      timeoutEpochs: jest.fn().mockResolvedValue(BigInt(24)),
      epochPeriod: jest.fn().mockResolvedValue(BigInt(P)),
      claimHashes: s.veaOutbox.claimHashes,
    };
    s.params.veaOutbox = outboxContract;
    (messageExecutor as jest.Mock).mockResolvedValue({ hash: "0xexec" });

    const handler = await challengeAndResolveClaim(s.params);

    expect(handler).toBeInstanceOf(ArbToGnosisTransactionHandler);
    expect(messageExecutor).toHaveBeenCalledWith("0xsent", s.route.inbox.provider, s.route.router.provider);
  });

  it("run-001 #21: the watcher-built 10200 handler runs through to messageExecutor on the Sepolia router", async () => {
    const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
    const outboxContract: any = {
      runner: { address: OUR_ADDRESS },
      latestVerifiedEpoch: jest.fn().mockResolvedValue(BigInt(EPOCH - 1)),
      timeoutEpochs: jest.fn().mockResolvedValue(BigInt(24)),
      epochPeriod: jest.fn().mockResolvedValue(BigInt(P)),
      claimHashes: s.veaOutbox.claimHashes,
    };
    // [L18]: the router account holds plenty for the execution.
    s.route.router.provider.getBalance = jest.fn().mockResolvedValue(10n ** 24n);
    // Built as the watcher builds it ([L10]): getTransactionHandler(chainId, network) with every provider.
    const Handler = getTransactionHandler(CHAIN_ID, Network.TESTNET) as any;
    const handler = new Handler({
      chainId: CHAIN_ID,
      network: Network.TESTNET,
      epoch: EPOCH,
      veaInbox: s.veaInbox,
      veaOutbox: outboxContract,
      veaInboxProvider: s.route.inbox.provider,
      veaOutboxProvider: s.route.outbox.provider,
      veaRouterProvider: s.route.router.provider,
      emitter: s.emitter,
      claim: null,
    });
    s.params.veaOutbox = outboxContract;
    s.params.transactionHandler = handler;
    // [L24] (d): only the claim resolve state is injected (an adopted ticket, executable).
    s.params.fetchClaimResolveState = jest
      .fn()
      .mockResolvedValue(
        resolveState({ sendSnapshot: { status: true, txHash: "0xsent" }, execution: { status: 1, txHash: "" } })
      );
    // The real settled-read gate, with the Arbitrum SDK finality read stubbed on the fixture's blocks.
    s.params.fetchSettledReadBlocks = resolveSettledReadBlocks;
    s.params.fetchBlocksAndCheckFinality = jest.fn(async () => [
      s.route.inbox.block("finalized"),
      s.route.router.block("finalized"),
      false,
      false,
    ]) as any;
    (messageExecutor as jest.Mock).mockReset().mockResolvedValue({ hash: "0xexec" });

    const result = await challengeAndResolveClaim(s.params);

    expect(result).toBe(handler);
    expect(handler).toBeInstanceOf(ArbToGnosisTransactionHandler);
    expect(handler.veaRouterProvider).toBe(s.route.router.provider);
    expect(messageExecutor).toHaveBeenCalledTimes(1);
    expect(messageExecutor).toHaveBeenCalledWith("0xsent", s.route.inbox.provider, s.route.router.provider);
    expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
  });
});
