import { ethers } from "ethers";
import { challengeAndResolveClaim, ChallengeAndResolveClaimParams } from "./validator";
import { createTwoChainRoute, TwoChainRoute } from "../testUtils/twoChainFixture";
import { getBridgeConfig, Network } from "../consts/bridgeRoutes";
import { EpochOutcome } from "../utils/epochOutcome";
import { BotEvents } from "../utils/botEvents";
import { CannotFundError, ArbToGnosisTransactionHandler, getTransactionHandler } from "../utils/transactionHandlers";
import { ClaimHonestState } from "../utils/claim";
import { messageExecutor } from "../utils/arbMsgExecutor";
import { resolveSettledReadBlocks } from "../utils/arbToEthState";
import { resetBridgeShutdownAlerts } from "./escapeHatch";

jest.mock("../utils/arbMsgExecutor", () => ({ messageExecutor: jest.fn(), getMessageStatus: jest.fn() }));

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
  // Behaves like getClaimResolveState's outbox read: claimHashes at the outbox read block.
  const fetchClaimResolveState = jest.fn(async (p: any) => {
    const head = await p.veaOutboxProvider.getBlock("finalized");
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

/** Move all three chains of the route forward by `secs` of chain time. */
const advanceChains = (route: TwoChainRoute, secs: number) => {
  for (const chain of [route.inbox, route.outbox, route.router]) chain.advance(secs / chain.options.secondsPerBlock);
};

describe("validator", () => {
  beforeEach(() => resetBridgeShutdownAlerts());

  describe("deciding on a claim", () => {
    it("challenges a claim whose root differs from snapshots[E] at the settled inbox block", async () => {
      const s = setup();
      await challengeAndResolveClaim(s.params);
      expect(s.veaInbox.snapshots).toHaveBeenCalledWith(EPOCH, { blockTag: s.route.inbox.block("finalized").number });
      expect(s.handler.challengeClaim).toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("reads nothing and is UNDECIDABLE while the epoch is not settled", async () => {
      const s = setup();
      s.params.fetchSettledReadBlocks = jest.fn().mockResolvedValue(null);
      await challengeAndResolveClaim(s.params);
      expect(s.veaInbox.snapshots).not.toHaveBeenCalled();
      expect(s.handler.challengeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });

    it("runs the finality check on Arbitrum's L1 (the Sepolia router), with the outbox on its own chain", async () => {
      const s = setup();
      await challengeAndResolveClaim(s.params);
      const args = (s.params.fetchSettledReadBlocks as jest.Mock).mock.calls[0][0];
      expect(args.l1Provider).toBe(s.route.router.provider);
      expect(args.outboxProvider).toBe(s.route.outbox.provider);
    });

    it("does not challenge a matching claim: PENDING for our own until verified, DONE for a third party's", async () => {
      const ours = setup(claimStruct({ stateRoot: HONEST_ROOT, claimer: OUR_ADDRESS }));
      await challengeAndResolveClaim(ours.params);
      expect(ours.handler.challengeClaim).not.toHaveBeenCalled();
      expect(ours.outcomes).toEqual([EpochOutcome.PENDING]);

      const theirs = setup(claimStruct({ stateRoot: HONEST_ROOT, claimer: OTHER }));
      await challengeAndResolveClaim(theirs.params);
      expect(theirs.handler.challengeClaim).not.toHaveBeenCalled();
      expect(theirs.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("reports UNDECIDABLE when the challenge cannot be funded", async () => {
      const s = setup();
      s.handler.challengeClaim = jest.fn().mockRejectedValue(new CannotFundError("challenge"));
      expect(await challengeAndResolveClaim(s.params)).toBe(s.handler);
      expect(s.outcomes).toEqual([EpochOutcome.UNDECIDABLE]);
    });
  });

  describe("an epoch with no claim", () => {
    it("is PENDING while the claim window is open on the outbox read block", async () => {
      const s = setup(null);
      await challengeAndResolveClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("is DONE once the window has closed and claimHashes is zero at that same read block", async () => {
      const s = setup(null);
      s.params.epoch = EPOCH - 2;
      await challengeAndResolveClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.DONE]);
      expect(s.claimHashAt.mock.calls[0][0]).toBe(s.route.outbox.block("finalized").number);
    });

    it("stays PENDING when a claim hash shows at the read block (a late claim getClaim did not see)", async () => {
      const s = setup(null);
      s.params.epoch = EPOCH - 2;
      s.claimHashAt.mockReturnValue("0x" + "ab".repeat(32));
      await challengeAndResolveClaim(s.params);
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });
  });

  describe("driving a dispute to resolution", () => {
    it.each([
      ["snapshot not sent", resolveState(), "sendSnapshot"],
      ["sent, not executable yet", resolveState({ sendSnapshot: { status: true, txHash: "0xsent" } }), null],
      [
        "sent and executable",
        resolveState({ sendSnapshot: { status: true, txHash: "0xsent" }, execution: { status: 1, txHash: "" } }),
        "resolveChallengedClaim",
      ],
    ])("%s: takes the next step and stays PENDING", async (_name, state, step) => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      s.params.fetchClaimResolveState = jest.fn().mockResolvedValue(state);
      await challengeAndResolveClaim(s.params);
      if (step) expect(s.handler[step]).toHaveBeenCalled();
      expect(s.handler.challengeClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("reads the outbox on its own chain and asks the Sepolia router for the message status", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      await challengeAndResolveClaim(s.params);
      const args = s.fetchClaimResolveState.mock.calls[0][0];
      expect(args.veaOutboxProvider).toBe(s.route.outbox.provider);
      expect(args.l1Provider).toBe(s.route.router.provider);
      expect(() => s.route.outbox.assertOwnBlock(s.claimHashAt.mock.calls[0][0] as number)).not.toThrow();
    });

    it("sends the snapshot once: the send is seen next cycle, however the host clock is set", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      const sentAtInboxBlock: number[] = [];
      s.handler.sendSnapshot = jest.fn(async () => {
        sentAtInboxBlock.push(s.route.inbox.resolve("latest"));
      });
      let executable = false;
      // The lookup reaches the inbox `latest` block, so our send is adopted once mined.
      s.params.fetchClaimResolveState = jest.fn(async (p: any) => {
        const latest = (await p.veaInboxProvider.getBlock("latest")).number;
        return sentAtInboxBlock.some((block) => block <= latest)
          ? resolveState({
              sendSnapshot: { status: true, txHash: "0xours" },
              execution: { status: executable ? 1 : 0 },
            })
          : resolveState();
      }) as any;

      jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask", "setImmediate"] });
      try {
        for (let cycle = 0; cycle < 20; cycle++) {
          jest.setSystemTime((s.route.outbox.block("latest").timestamp + 1800) * 1000);
          if (cycle === 19) executable = true;
          await challengeAndResolveClaim(s.params);
          advanceChains(s.route, 120);
        }
      } finally {
        jest.useRealTimers();
      }

      expect(s.handler.sendSnapshot).toHaveBeenCalledTimes(1);
      expect(s.handler.resolveChallengedClaim).toHaveBeenCalledWith("0xours");
    });

    it("an executed ticket that left the claim unresolved sends nothing more (Gnosis AMB failure is not detected)", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      s.params.fetchClaimResolveState = jest
        .fn()
        .mockResolvedValue(
          resolveState({ sendSnapshot: { status: true, txHash: "0xsent" }, execution: { status: 2 } })
        );
      await challengeAndResolveClaim(s.params);
      expect(s.handler.sendSnapshot).not.toHaveBeenCalled();
      expect(s.handler.resolveChallengedClaim).not.toHaveBeenCalled();
      expect(s.outcomes).toEqual([EpochOutcome.PENDING]);
    });

    it("the real Gnosis handler executes through the Sepolia router", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS }));
      const outboxContract: any = {
        runner: { address: OUR_ADDRESS },
        latestVerifiedEpoch: jest.fn().mockResolvedValue(BigInt(EPOCH - 1)),
        timeoutEpochs: jest.fn().mockResolvedValue(BigInt(24)),
        epochPeriod: jest.fn().mockResolvedValue(BigInt(P)),
        claimHashes: s.veaOutbox.claimHashes,
      };
      s.route.router.provider.getBalance = jest.fn().mockResolvedValue(10n ** 24n);
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
      s.params.fetchClaimResolveState = jest
        .fn()
        .mockResolvedValue(
          resolveState({ sendSnapshot: { status: true, txHash: "0xsent" }, execution: { status: 1 } })
        );
      s.params.fetchSettledReadBlocks = resolveSettledReadBlocks;
      s.params.fetchBlocksAndCheckFinality = jest.fn(async () => [
        s.route.inbox.block("finalized"),
        s.route.router.block("finalized"),
        false,
        false,
      ]) as any;
      (messageExecutor as jest.Mock).mockReset().mockResolvedValue({ hash: "0xexec" });

      expect(await challengeAndResolveClaim(s.params)).toBe(handler);
      expect(handler).toBeInstanceOf(ArbToGnosisTransactionHandler);
      expect(messageExecutor).toHaveBeenCalledWith("0xsent", s.route.inbox.provider, s.route.router.provider);
    });
  });

  describe("deposits and the escape hatch", () => {
    it("withdraws our won challenge deposit, never another challenger's", async () => {
      const ours = setup(claimStruct({ challenger: OUR_ADDRESS, honest: ClaimHonestState.CHALLENGER }));
      await challengeAndResolveClaim(ours.params);
      expect(ours.handler.withdrawChallengeDeposit).toHaveBeenCalled();
      expect(ours.outcomes).toEqual([EpochOutcome.PENDING]);

      const theirs = setup(claimStruct({ challenger: OTHER, honest: ClaimHonestState.CHALLENGER }));
      await challengeAndResolveClaim(theirs.params);
      expect(theirs.handler.withdrawChallengeDeposit).not.toHaveBeenCalled();
      expect(theirs.outcomes).toEqual([EpochOutcome.DONE]);
    });

    it("recovers a deposit before the settled-read gate, so inbox or L1 outages do not block it", async () => {
      const s = setup(claimStruct({ challenger: OUR_ADDRESS, honest: ClaimHonestState.CHALLENGER }));
      s.params.fetchSettledReadBlocks = jest.fn().mockRejectedValue(new Error("inbox rpc down"));
      await challengeAndResolveClaim(s.params);
      expect(s.handler.withdrawChallengeDeposit).toHaveBeenCalled();
      expect(s.params.fetchSettledReadBlocks).not.toHaveBeenCalled();
    });

    it("withdraws our challenge through the escape hatch once the bridge has timed out, and never challenges into a dead bridge", async () => {
      const ours = setup(claimStruct({ challenger: OUR_ADDRESS }));
      ours.handler.isBridgeShutdown.mockResolvedValue(true);
      await challengeAndResolveClaim(ours.params);
      expect(ours.handler.withdrawChallengerEscapeHatch).toHaveBeenCalled();
      expect(ours.emitter.emit).toHaveBeenCalledWith(
        BotEvents.ESCAPE_HATCH,
        expect.objectContaining({ party: "challenger", action: "detected", epoch: EPOCH })
      );

      const fresh = setup();
      fresh.handler.isBridgeShutdown.mockResolvedValue(true);
      await challengeAndResolveClaim(fresh.params);
      expect(fresh.handler.challengeClaim).not.toHaveBeenCalled();
      expect(fresh.outcomes).toEqual([EpochOutcome.DONE]);
    });
  });
});
