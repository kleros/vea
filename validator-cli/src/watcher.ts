import { getBridgeConfig, Network } from "./consts/bridgeRoutes";
import { getVeaInbox, getVeaOutbox } from "./utils/ethers";
import { FallbackRpcProvider } from "./utils/fallbackProvider";
import { FallbackProviderV5 } from "./utils/fallbackProviderV5";
import { setEpochRange } from "./utils/epochHandler";
import { defaultEmitter } from "./utils/emitter";
import { BotEvents } from "./utils/botEvents";
import { initialize as initializeLogger } from "./utils/logger";
import { ShutdownSignal, installShutdownHandlers } from "./utils/shutdown";
import { sendHeartbeat } from "./utils/heartbeat";
import { getBotPath, BotPaths, getNetworkConfig, NetworkConfig } from "./utils/botConfig";
import { getClaim } from "./utils/claim";
import { CheckAndClaimParams, checkAndClaim } from "./helpers/claimer";
import { ChallengeAndResolveClaimParams, challengeAndResolveClaim } from "./helpers/validator";
import { saveSnapshot, SaveSnapshotParams } from "./helpers/snapshot";
import { getTransactionHandler } from "./utils/transactionHandlers";
import { validateEnvironment } from "./utils/envValidation";
import { EpochOutcome, mergeOutcomes } from "./utils/epochOutcome";

const CYCLE_DELAY_MS = 2 * 60 * 1000; // 2 minutes

// An epoch older than the watch window leaves after this many consecutive null cycles.
const NULL_CYCLES_TO_LEAVE = 2;
// At most this many epochs older than the watch window are examined per cycle, so the
// cold-start backlog (a week of epochs) never delays the next cycle's claimable epoch.
const BACKLOG_EPOCHS_PER_CYCLE = 20;
// Alert after this many consecutive undecidable cycles, and again each further as many.
const UNDECIDABLE_CYCLES_TO_ALERT = 15;
// Undecidable cycles count only from (E+1)·P + this grace, past normal settlement lag.
const UNDECIDABLE_GRACE_SECS = 3600;
// A testnet route with no claim for this long (outbox chain time) raises LIVENESS_ALARM,
// at most once per this period.
const LIVENESS_PERIOD_SECS = 24 * 60 * 60;

/**
 * Per-epoch state. Reset rules:
 * - `nullStreak`: +1 for an examined cycle in which `getClaim` returned null and no helper
 *   reported PENDING or UNDECIDABLE (nor returned a handler without reporting). Back to 0 on any
 *   other cycle: a claim, a throw, a PENDING/UNDECIDABLE report, or the route failing before the
 *   epoch was examined.
 * - `done`: the last examined cycle's merged outcome was an explicit DONE. Cleared by any
 *   other cycle, including a throw or a route failure before the epoch.
 * - `undecidableStreak`: +1 for a cycle whose merged outcome is UNDECIDABLE or in which the
 *   epoch threw, counted only once outbox chain time is at or past (E+1)·P + 3600 s. Back to 0 on
 *   an examined cycle with any other outcome at or past that time. Cycles before that time, and
 *   cycles in which the route failed before the epoch (ROUTE_FAILED already alerts), leave it as is.
 */
interface EpochTrack {
  nullStreak: number;
  done: boolean;
  undecidableStreak: number;
}

/** Everything one cycle builds to talk to a route's chains. */
interface RouteConnections {
  veaInbox: any;
  veaOutbox: any;
  veaInboxProvider: any;
  veaOutboxProvider: any;
  veaRouterProvider: any;
}

/**
 * Per-route state, keyed by `${chainId}_${network}`. Reset rules:
 * - `epochs`: on testnet every epoch examined or seeded by the cold start and not yet left;
 *   on devnet only the current epoch (older ones leave at rollover).
 * - `coldStartDone`: set once the cold-start range is seeded on the route's first cycle.
 * - `firstCycleTime`: outbox chain time of the route's first cycle (liveness baseline with no claim).
 * - `newestClaimTimestamp`: the newest `timestampClaimed` fetched so far; never decreases.
 * - `lastLivenessAlarm`: chain time of the last LIVENESS_ALARM; one alarm per 24 h at most.
 * - `snapshotCount`: the inbox count saveSnapshot last returned (-1 before the first).
 * - `backlogCursor`: the oldest epoch below the window picked last cycle; the next cycle
 *   continues below it and wraps back to the newest one once none is left.
 */
interface RouteState {
  chainId: number;
  network: Network;
  epochs: Map<number, EpochTrack>;
  coldStartDone: boolean;
  firstCycleTime?: number;
  newestClaimTimestamp?: number;
  lastLivenessAlarm?: number;
  snapshotCount: number;
  backlogCursor?: number;
  connections?: RouteConnections;
}

export interface WatcherState {
  routes: { [routeKey: string]: RouteState };
  /** Claim/challenge handlers under `${chainId}_${network}_${epoch}`, snapshot handlers under `snapshot_${chainId}_${network}_${epoch}`. */
  transactionHandlers: { [key: string]: any };
}

export interface WatchOptions {
  cycleDelayMs?: number;
  /** The most epochs older than the watch window examined per cycle (default `BACKLOG_EPOCHS_PER_CYCLE`). */
  backlogEpochsPerCycle?: number;
  /** The loop's state; a caller may pass its own to inspect it. */
  state?: WatcherState;
}

export const claimHandlerKey = (chainId: number, network: Network, epoch: number) => `${chainId}_${network}_${epoch}`;
export const snapshotHandlerKey = (chainId: number, network: Network, epoch: number) =>
  `snapshot_${chainId}_${network}_${epoch}`;

/**
 * Error text for an event payload: URLs are cut out, since an RPC URL often embeds an API key.
 */
const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(
    /[a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'<>,)]+/gi,
    "<url>"
  );

/**
 * @file This file contains the logic for watching bridge and validating/resolving for claims.
 *
 * @param shutDownSignal - The signal to shut down the watcher
 * @param emitter - The emitter to emit events
 * @param options - `cycleDelayMs`: the pause between cycles; `backlogEpochsPerCycle`: the cap on
 *   epochs older than the watch window per cycle; `state`: the loop's state
 *
 */

export const watch = async (
  shutDownSignal: ShutdownSignal = new ShutdownSignal(),
  emitter: typeof defaultEmitter = defaultEmitter,
  {
    cycleDelayMs = CYCLE_DELAY_MS,
    backlogEpochsPerCycle = BACKLOG_EPOCHS_PER_CYCLE,
    state = { routes: {}, transactionHandlers: {} },
  }: WatchOptions = {}
) => {
  initializeLogger(emitter);
  // Validate the whole environment before anything else, including before the
  // first heartbeat: a bot that reports "started" and then dies on a missing
  // variable looks alive to whatever is watching it.
  const validatedEnv = await validateEnvironment();
  emitter.emit(BotEvents.ENV_VALIDATED, validatedEnv.signerAddress, validatedEnv.chainIds, validatedEnv.networks);
  for (const warning of validatedEnv.warnings) emitter.emit(BotEvents.ENV_WARNING, warning);
  const cliCommand = process.argv;
  const { path, toSaveSnapshot } = getBotPath({ cliCommand });
  const networkConfigs = getNetworkConfig();
  const heartbeatURL = process.env.HEARTBEAT_URL;
  const removeShutdownHandlers = installShutdownHandlers(shutDownSignal, emitter);
  try {
    await sendHeartbeat("started", heartbeatURL, emitter);
    emitter.emit(BotEvents.STARTED, path, networkConfigs[0]?.networks);
    while (!shutDownSignal.getIsShutdownSignal()) {
      await sendHeartbeat("running", heartbeatURL, emitter);
      for (const networkConfig of networkConfigs) {
        if (shutDownSignal.getIsShutdownSignal()) break;
        await processNetwork(
          path,
          toSaveSnapshot,
          networkConfig,
          state,
          backlogEpochsPerCycle,
          shutDownSignal,
          emitter
        );
      }
      await shutDownSignal.wait(cycleDelayMs);
    }
  } finally {
    removeShutdownHandlers();
    await sendHeartbeat("stopped", heartbeatURL, emitter);
  }
};

async function processNetwork(
  path: number,
  toSaveSnapshot: boolean,
  networkConfig: NetworkConfig,
  state: WatcherState,
  backlogEpochsPerCycle: number,
  shutDownSignal: ShutdownSignal,
  emitter: typeof defaultEmitter
): Promise<void> {
  const { chainId, networks } = networkConfig;
  for (const network of networks) {
    if (shutDownSignal.getIsShutdownSignal()) return;
    const routeKey = `${chainId}_${network}`;
    state.routes[routeKey] ??= {
      chainId,
      network,
      epochs: new Map(),
      coldStartDone: false,
      snapshotCount: -1,
    };
    const route = state.routes[routeKey];
    const examined = new Set<number>();
    try {
      emitter.emit(BotEvents.WATCHING, chainId, network);
      await processRoute({
        path,
        toSaveSnapshot,
        route,
        state,
        examined,
        backlogEpochsPerCycle,
        shutDownSignal,
        emitter,
      });
    } catch (error) {
      emitter.emit(BotEvents.ROUTE_FAILED, { chainId, network, message: errorMessage(error) });
      // Every epoch the failure kept from being examined stays watched for another cycle.
      for (const [epoch, track] of route.epochs) {
        if (examined.has(epoch)) continue;
        track.nullStreak = 0;
        track.done = false;
      }
    }
  }
}

const connectRoute = (chainId: number, network: Network, emitter: typeof defaultEmitter): RouteConnections => {
  const { routeConfig, inboxRPC, outboxRPC, routerRPC } = getBridgeConfig(chainId);
  const privKey = process.env.PRIVATE_KEY;
  // v6 providers for the typechain contract connections (the inbox chainId is detected via the fallback transport).
  const veaInboxContractProvider = new FallbackRpcProvider(inboxRPC, emitter);
  const veaOutboxContractProvider = new FallbackRpcProvider(outboxRPC, emitter, chainId);
  const veaInbox = getVeaInbox(
    routeConfig[network].veaInbox.address,
    privKey,
    veaInboxContractProvider,
    chainId,
    network
  );
  const veaOutbox = getVeaOutbox(
    routeConfig[network].veaOutbox.address,
    privKey,
    veaOutboxContractProvider,
    chainId,
    network
  );
  // v5 providers for the standalone reads / Arbitrum SDK path.
  const veaInboxProvider = new FallbackProviderV5(inboxRPC, emitter);
  const veaOutboxProvider = new FallbackProviderV5(outboxRPC, emitter);
  const veaRouterProvider = routerRPC && routerRPC.length > 0 ? new FallbackProviderV5(routerRPC, emitter) : undefined;
  return { veaInbox, veaOutbox, veaInboxProvider, veaOutboxProvider, veaRouterProvider };
};

/**
 * The epochs a claim can still be challenged in: every E with
 * floor((now - B) / P) - 2 <= E <= floor(now / P) - 1, where B is the challenge budget
 * (epochPeriod + sequencerDelayLimit + minChallengePeriod).
 */
const watchWindow = (now: number, epochPeriod: number, sequencerDelayLimit: number, minChallengePeriod: number) => {
  const budget = epochPeriod + sequencerDelayLimit + minChallengePeriod;
  return {
    low: Math.floor((now - budget) / epochPeriod) - 2,
    high: Math.floor(now / epochPeriod) - 1,
  };
};

const dropEpoch = (
  state: WatcherState,
  route: RouteState,
  epoch: number,
  reason: string,
  emitter: typeof defaultEmitter
) => {
  route.epochs.delete(epoch);
  delete state.transactionHandlers[claimHandlerKey(route.chainId, route.network, epoch)];
  emitter.emit(BotEvents.EPOCH_DROPPED, { chainId: route.chainId, network: route.network, epoch, reason });
};

interface ProcessRouteParams {
  path: number;
  toSaveSnapshot: boolean;
  route: RouteState;
  state: WatcherState;
  examined: Set<number>;
  backlogEpochsPerCycle: number;
  shutDownSignal: ShutdownSignal;
  emitter: typeof defaultEmitter;
}

async function processRoute({
  path,
  toSaveSnapshot,
  route,
  state,
  examined,
  backlogEpochsPerCycle,
  shutDownSignal,
  emitter,
}: ProcessRouteParams): Promise<void> {
  const { chainId, network } = route;
  const { routeConfig, sequencerDelayLimit, minChallengePeriod } = getBridgeConfig(chainId);
  const epochPeriod: number = routeConfig[network].epochPeriod;
  route.connections ??= connectRoute(chainId, network, emitter);
  const connections = route.connections;

  // Every "now" of this cycle is the outbox chain's latest block time, never the host clock.
  const now = (await connections.veaOutboxProvider.getBlock("latest")).timestamp;
  route.firstCycleTime ??= now;
  const currentEpoch = Math.floor(now / epochPeriod);

  const { toWatch, windowLow } = collectEpochsToWatch({
    route,
    state,
    now,
    currentEpoch,
    epochPeriod,
    sequencerDelayLimit,
    minChallengePeriod,
    backlogEpochsPerCycle,
    emitter,
  });

  if (toSaveSnapshot) await processSnapshot({ route, state, connections, epochPeriod, now, currentEpoch, emitter });

  for (const epoch of toWatch) {
    if (shutDownSignal.getIsShutdownSignal()) return;
    await processEpoch({ path, route, state, connections, epochPeriod, epoch, now, emitter });
    examined.add(epoch);
  }

  if (windowLow !== undefined) {
    pruneAgedEpochs(state, route, windowLow, emitter);
    checkLiveness(route, now, emitter);
  }
}

interface CollectEpochsParams {
  route: RouteState;
  state: WatcherState;
  now: number;
  currentEpoch: number;
  epochPeriod: number;
  sequencerDelayLimit: number;
  minChallengePeriod: number;
  backlogEpochsPerCycle: number;
  emitter: typeof defaultEmitter;
}

/**
 * Which epochs this cycle examines. Devnet watches only the current epoch and drops older
 * ones at rollover. Testnet watches the challenge-budget window, newest first and without the
 * epochs already DONE, then up to
 * `backlogEpochsPerCycle` older epochs still tracked, resuming below where the last cycle
 * stopped. On a route's first cycle the cold-start range is added so a restarted bot picks up
 * disputes it started earlier.
 */
const collectEpochsToWatch = ({
  route,
  state,
  now,
  currentEpoch,
  epochPeriod,
  sequencerDelayLimit,
  minChallengePeriod,
  backlogEpochsPerCycle,
  emitter,
}: CollectEpochsParams): { toWatch: number[]; windowLow?: number } => {
  if (route.network == Network.DEVNET) {
    for (const epoch of [...route.epochs.keys()]) {
      if (epoch != currentEpoch) dropEpoch(state, route, epoch, "devnet_rollover", emitter);
    }
    return { toWatch: [currentEpoch] };
  }
  if (!route.coldStartDone) {
    const epochRange = setEpochRange({ chainId: route.chainId, currentTimestamp: now, epochPeriod, now: now * 1000 });
    for (const epoch of epochRange) {
      if (!route.epochs.has(epoch)) route.epochs.set(epoch, { nullStreak: 0, done: false, undecidableStreak: 0 });
    }
    route.coldStartDone = true;
  }
  const window = watchWindow(now, epochPeriod, sequencerDelayLimit, minChallengePeriod);
  // Newest first: the claimable epoch is the most time-sensitive. A window epoch that reported
  // DONE is skipped until it leaves the window: DONE is final (no claim can appear for an epoch
  // once its claim period is past the read block, and a resolved claim leaves nothing for us).
  // The claimable epoch is examined every cycle regardless.
  const inWindow: number[] = [];
  for (let epoch = window.high; epoch >= window.low; epoch--) {
    if (epoch == window.high || !route.epochs.get(epoch)?.done) inWindow.push(epoch);
  }
  const backlog = [...route.epochs.keys()].filter((epoch) => epoch < window.low).sort((a, b) => b - a);
  const cursor = route.backlogCursor;
  const below = cursor === undefined ? backlog : backlog.filter((epoch) => epoch < cursor);
  const picked = (below.length > 0 ? below : backlog).slice(0, backlogEpochsPerCycle);
  if (picked.length > 0) route.backlogCursor = picked[picked.length - 1];
  return { toWatch: [...inWindow, ...picked], windowLow: window.low };
};

/** Testnet exit rule for epochs older than the window: gone once done, or after two cycles without a claim. */
const pruneAgedEpochs = (state: WatcherState, route: RouteState, windowLow: number, emitter: typeof defaultEmitter) => {
  for (const [epoch, track] of [...route.epochs]) {
    if (epoch >= windowLow) continue;
    if (track.done) dropEpoch(state, route, epoch, "done", emitter);
    else if (track.nullStreak >= NULL_CYCLES_TO_LEAVE) dropEpoch(state, route, epoch, "no_claim", emitter);
  }
};

/**
 * One LIVENESS_ALARM per 24 h of outbox chain time while the newest fetched `timestampClaimed`
 * (or, with none fetched, the first cycle's time) is 24 h old.
 */
const checkLiveness = (route: RouteState, now: number, emitter: typeof defaultEmitter) => {
  const baseline = route.newestClaimTimestamp ?? route.firstCycleTime;
  if (baseline === undefined || now - baseline < LIVENESS_PERIOD_SECS) return;
  if (route.lastLivenessAlarm !== undefined && now - route.lastLivenessAlarm < LIVENESS_PERIOD_SECS) return;
  route.lastLivenessAlarm = now;
  emitter.emit(BotEvents.LIVENESS_ALARM, {
    chainId: route.chainId,
    network: route.network,
    secondsSinceLastClaim: now - baseline,
  });
};

interface ProcessSnapshotParams {
  route: RouteState;
  state: WatcherState;
  connections: RouteConnections;
  epochPeriod: number;
  now: number;
  currentEpoch: number;
  emitter: typeof defaultEmitter;
}

async function processSnapshot({
  route,
  state,
  connections,
  epochPeriod,
  now,
  currentEpoch,
  emitter,
}: ProcessSnapshotParams) {
  const { chainId, network } = route;
  const key = snapshotHandlerKey(chainId, network, currentEpoch);
  const prefix = `snapshot_${chainId}_${network}_`;
  for (const stale of Object.keys(state.transactionHandlers)) {
    if (stale.startsWith(prefix) && stale != key) delete state.transactionHandlers[stale];
  }
  try {
    const transactionHandler =
      state.transactionHandlers[key] ?? buildHandler(route, connections, currentEpoch, emitter);
    state.transactionHandlers[key] = transactionHandler;
    const params: SaveSnapshotParams = {
      chainId,
      veaInbox: connections.veaInbox,
      veaOutbox: connections.veaOutbox,
      veaInboxProvider: connections.veaInboxProvider,
      veaOutboxProvider: connections.veaOutboxProvider,
      network,
      epochPeriod,
      count: route.snapshotCount,
      transactionHandler,
      emitter,
      now,
    };
    const { updatedTransactionHandler, latestCount } = await saveSnapshot(params);
    if (updatedTransactionHandler) state.transactionHandlers[key] = updatedTransactionHandler;
    route.snapshotCount = latestCount;
  } catch (error) {
    emitter.emit(BotEvents.EPOCH_FAILED, {
      chainId,
      network,
      epoch: currentEpoch,
      message: `saveSnapshot: ${errorMessage(error)}`,
    });
  }
}

/**
 * The claim/challenge handler is built here, once per epoch, with every provider (the router
 * included), and passed into both helpers.
 */
const buildHandler = (
  route: RouteState,
  connections: RouteConnections,
  epoch: number,
  emitter: typeof defaultEmitter
) => {
  const TransactionHandler = getTransactionHandler(route.chainId, route.network) as any;
  return new TransactionHandler({
    chainId: route.chainId,
    network: route.network,
    epoch,
    veaInbox: connections.veaInbox,
    veaOutbox: connections.veaOutbox,
    veaInboxProvider: connections.veaInboxProvider,
    veaOutboxProvider: connections.veaOutboxProvider,
    veaRouterProvider: connections.veaRouterProvider,
    emitter,
    claim: null,
  });
};

interface ProcessEpochParams {
  path: number;
  route: RouteState;
  state: WatcherState;
  connections: RouteConnections;
  epochPeriod: number;
  epoch: number;
  now: number;
  emitter: typeof defaultEmitter;
}

/** What one cycle's work on an epoch produced, before the keep/exit bookkeeping. */
interface EpochCycleResult {
  claim: Awaited<ReturnType<typeof getClaim>>;
  outcome: EpochOutcome | undefined;
  failures: string[];
  handlerReturned: boolean;
}

async function processEpoch({ path, route, state, connections, epochPeriod, epoch, now, emitter }: ProcessEpochParams) {
  const { chainId, network } = route;
  let track = route.epochs.get(epoch);
  if (!track) {
    track = { nullStreak: 0, done: false, undecidableStreak: 0 };
    route.epochs.set(epoch, track);
  }

  const result = await runEpochHelpers({ path, route, state, connections, epochPeriod, epoch, now, emitter });
  if (result.claim) {
    const claimed = Number(result.claim.timestampClaimed);
    if (claimed > 0 && claimed > (route.newestClaimTimestamp ?? 0)) route.newestClaimTimestamp = claimed;
  }
  for (const message of result.failures) emitter.emit(BotEvents.EPOCH_FAILED, { chainId, network, epoch, message });

  updateKeepState(track, result);
  trackUndecidable(track, result, { route, epoch, epochPeriod, now, emitter });
}

/**
 * Fetch the claim and run the challenger and claimer on it. Each step is isolated: a throw in
 * one is recorded as a failure and does not stop the others on the same epoch.
 */
async function runEpochHelpers({
  path,
  route,
  state,
  connections,
  epochPeriod,
  epoch,
  emitter,
}: ProcessEpochParams): Promise<EpochCycleResult> {
  const { chainId, network } = route;
  const { veaInbox, veaOutbox, veaInboxProvider, veaOutboxProvider, veaRouterProvider } = connections;
  const result: EpochCycleResult = { claim: null, outcome: undefined, failures: [], handlerReturned: false };
  const reportOutcome = (reported: EpochOutcome) => {
    result.outcome = mergeOutcomes(result.outcome, reported);
  };

  try {
    result.claim = await getClaim({ network, chainId, veaOutbox, veaOutboxProvider, epoch, epochPeriod, emitter });
  } catch (error) {
    result.failures.push(`getClaim: ${errorMessage(error)}`);
    return result;
  }

  const key = claimHandlerKey(chainId, network, epoch);
  const transactionHandler = () =>
    (state.transactionHandlers[key] ??= buildHandler(route, connections, epoch, emitter));
  const shared = {
    chainId,
    epoch,
    epochPeriod,
    veaInbox,
    veaInboxProvider,
    veaOutboxProvider,
    veaRouterProvider,
    veaOutbox,
    emitter,
    reportOutcome,
  };

  if (path > BotPaths.CLAIMER && result.claim != null) {
    try {
      const deps: ChallengeAndResolveClaimParams = {
        ...shared,
        claim: result.claim,
        transactionHandler: transactionHandler(),
      };
      if (await challengeAndResolveClaim(deps)) result.handlerReturned = true;
    } catch (error) {
      result.failures.push(`challengeAndResolveClaim: ${errorMessage(error)}`);
    }
  }
  if (path == BotPaths.CLAIMER || path == BotPaths.BOTH) {
    try {
      // No `now` here: checkAndClaim takes milliseconds and defaults to chain time itself.
      const params: CheckAndClaimParams = {
        ...shared,
        network,
        claim: result.claim,
        transactionHandler: transactionHandler(),
      };
      if (await checkAndClaim(params)) result.handlerReturned = true;
    } catch (error) {
      result.failures.push(`checkAndClaim: ${errorMessage(error)}`);
    }
  }
  return result;
}

/**
 * Keep-and-exit bookkeeping: an epoch stays while it has a claim, a pending or undecidable
 * outcome, a failure this cycle, or a returned handler with no report; it is done only on an
 * explicit DONE with no failure.
 */
const updateKeepState = (track: EpochTrack, { claim, outcome, failures, handlerReturned }: EpochCycleResult) => {
  const failed = failures.length > 0;
  const keep =
    failed ||
    claim != null ||
    outcome === EpochOutcome.PENDING ||
    outcome === EpochOutcome.UNDECIDABLE ||
    (outcome === undefined && handlerReturned);
  track.nullStreak = keep ? 0 : track.nullStreak + 1;
  track.done = !failed && outcome === EpochOutcome.DONE;
};

interface TrackUndecidableContext {
  route: RouteState;
  epoch: number;
  epochPeriod: number;
  now: number;
  emitter: typeof defaultEmitter;
}

/**
 * Count consecutive undecidable (or failed) cycles once the epoch is an hour past its end, so
 * normal settlement lag never alerts, and raise `epoch_undecidable` every 15 of them.
 */
const trackUndecidable = (
  track: EpochTrack,
  { outcome, failures }: EpochCycleResult,
  { route, epoch, epochPeriod, now, emitter }: TrackUndecidableContext
) => {
  if (now < (epoch + 1) * epochPeriod + UNDECIDABLE_GRACE_SECS) return;
  if (failures.length === 0 && outcome !== EpochOutcome.UNDECIDABLE) {
    track.undecidableStreak = 0;
    return;
  }
  track.undecidableStreak++;
  if (track.undecidableStreak % UNDECIDABLE_CYCLES_TO_ALERT != 0) return;
  emitter.emit(BotEvents.ALERT, {
    level: "error",
    code: "epoch_undecidable",
    chainId: route.chainId,
    network: route.network,
    epoch,
    details: { consecutiveCycles: track.undecidableStreak },
  });
};

if (require.main === module) {
  const shutDownSignal = new ShutdownSignal(false);
  watch(shutDownSignal).then(
    () => process.exit(0),
    (error) => {
      console.error(errorMessage(error));
      process.exit(1);
    }
  );
}
