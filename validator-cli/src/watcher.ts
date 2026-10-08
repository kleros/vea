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

// [L8]: an epoch older than the watch window leaves after this many consecutive null cycles.
const NULL_CYCLES_TO_LEAVE = 2;
// [G5]/[L3]: alert after this many consecutive undecidable cycles, and again each further as many.
const UNDECIDABLE_CYCLES_TO_ALERT = 15;
// [L3]: undecidable cycles count only from (E+1)·P + this grace, past normal settlement lag.
const UNDECIDABLE_GRACE_SECS = 3600;
// [G4]/[L4]/[L6]: a testnet route with no claim for this long (outbox chain time) raises LIVENESS_ALARM,
// at most once per this period.
const LIVENESS_PERIOD_SECS = 24 * 60 * 60;

/**
 * Per-epoch state. Reset rules:
 * - `nullStreak` ([L8]): +1 for an examined cycle in which `getClaim` returned null and no helper
 *   reported PENDING or UNDECIDABLE (nor returned a handler without reporting). Back to 0 on any
 *   other cycle: a claim, a throw, a PENDING/UNDECIDABLE report, or the route failing before the
 *   epoch was examined.
 * - `done` ([L8]): the last examined cycle's merged outcome was an explicit DONE. Cleared by any
 *   other cycle, including a throw or a route failure before the epoch.
 * - `undecidableStreak` ([L3]): +1 for a cycle whose merged outcome is UNDECIDABLE or in which the
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
 * - `firstCycleTime`: outbox chain time of the route's first cycle (liveness baseline with no claim, [L6]).
 * - `newestClaimTimestamp`: the newest `timestampClaimed` fetched so far ([L4]); never decreases.
 * - `lastLivenessAlarm`: chain time of the last LIVENESS_ALARM; one alarm per 24 h at most.
 * - `snapshotCount`: the inbox count saveSnapshot last returned (-1 before the first).
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
  connections?: RouteConnections;
}

export interface WatcherState {
  routes: { [routeKey: string]: RouteState };
  /** Claim/challenge handlers under `${chainId}_${network}_${epoch}`, snapshot handlers under `snapshot_${chainId}_${network}_${epoch}`. */
  transactionHandlers: { [key: string]: any };
}

export interface WatchOptions {
  cycleDelayMs?: number;
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
  (error instanceof Error ? error.message : String(error)).replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>,)]+/gi, "<url>");

/**
 * @file This file contains the logic for watching bridge and validating/resolving for claims.
 *
 * @param shutDownSignal - The signal to shut down the watcher
 * @param emitter - The emitter to emit events
 * @param options - `cycleDelayMs`: the pause between cycles; `state`: the loop's state
 *
 */

export const watch = async (
  shutDownSignal: ShutdownSignal = new ShutdownSignal(),
  emitter: typeof defaultEmitter = defaultEmitter,
  { cycleDelayMs = CYCLE_DELAY_MS, state = { routes: {}, transactionHandlers: {} } }: WatchOptions = {}
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
        await processNetwork(path, toSaveSnapshot, networkConfig, state, shutDownSignal, emitter);
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
      await processRoute({ path, toSaveSnapshot, route, state, examined, shutDownSignal, emitter });
    } catch (error) {
      emitter.emit(BotEvents.ROUTE_FAILED, { chainId, network, message: errorMessage(error) });
      // [L8]: every epoch the failure kept from being examined stays watched for another cycle.
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
 * [L5] window: every E with floor((now - B) / P) - 2 <= E <= floor(now / P) - 1,
 * where B = epochPeriod + sequencerDelayLimit + minChallengePeriod.
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
  shutDownSignal: ShutdownSignal;
  emitter: typeof defaultEmitter;
}

async function processRoute({
  path,
  toSaveSnapshot,
  route,
  state,
  examined,
  shutDownSignal,
  emitter,
}: ProcessRouteParams): Promise<void> {
  const { chainId, network } = route;
  const { routeConfig, sequencerDelayLimit, minChallengePeriod } = getBridgeConfig(chainId);
  const epochPeriod: number = routeConfig[network].epochPeriod;
  route.connections ??= connectRoute(chainId, network, emitter);
  const connections = route.connections;

  // Every "now" of this cycle is the outbox chain's latest block time (PRD 4.2), never the host clock.
  const now = (await connections.veaOutboxProvider.getBlock("latest")).timestamp;
  route.firstCycleTime ??= now;
  const currentEpoch = Math.floor(now / epochPeriod);

  let toWatch: number[];
  let windowLow: number | undefined;
  if (network == Network.DEVNET) {
    // [L8] devnet: only the current epoch, as before; older ones leave at rollover.
    for (const epoch of [...route.epochs.keys()]) {
      if (epoch != currentEpoch) dropEpoch(state, route, epoch, "devnet_rollover", emitter);
    }
    toWatch = [currentEpoch];
  } else {
    if (!route.coldStartDone) {
      // A restarted bot picks up disputes it started earlier: the cold-start range is the
      // route's initial set of older epochs, each kept until examined under the [L8] rule.
      const epochRange = setEpochRange({ chainId, currentTimestamp: now, epochPeriod, now: now * 1000 });
      for (const epoch of epochRange) {
        if (!route.epochs.has(epoch)) route.epochs.set(epoch, { nullStreak: 0, done: false, undecidableStreak: 0 });
      }
      route.coldStartDone = true;
    }
    const window = watchWindow(now, epochPeriod, sequencerDelayLimit, minChallengePeriod);
    windowLow = window.low;
    const epochs = new Set<number>(route.epochs.keys());
    for (let epoch = window.low; epoch <= window.high; epoch++) epochs.add(epoch);
    // Newest first: the claimable epoch is the most time-sensitive.
    toWatch = [...epochs].filter((epoch) => epoch <= window.high).sort((a, b) => b - a);
  }

  if (toSaveSnapshot) await processSnapshot({ route, state, connections, epochPeriod, now, currentEpoch, emitter });

  for (const epoch of toWatch) {
    if (shutDownSignal.getIsShutdownSignal()) return;
    await processEpoch({ path, route, state, connections, epochPeriod, epoch, now, emitter });
    examined.add(epoch);
  }

  if (windowLow !== undefined) {
    // [L8] testnet exit rule, for epochs older than the window only.
    for (const [epoch, track] of [...route.epochs]) {
      if (epoch >= windowLow) continue;
      if (track.done) dropEpoch(state, route, epoch, "done", emitter);
      else if (track.nullStreak >= NULL_CYCLES_TO_LEAVE) dropEpoch(state, route, epoch, "no_claim", emitter);
    }
    checkLiveness(route, now, emitter);
  }
}

/**
 * [G4] as refined by [L4] and [L6]: one LIVENESS_ALARM per 24 h of outbox chain time while the
 * newest fetched `timestampClaimed` (or, with none fetched, the first cycle's time) is 24 h old.
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
 * [L10]: the claim/challenge handler is built here, once per epoch, with every provider
 * (the router included), and passed into both helpers.
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

async function processEpoch({ path, route, state, connections, epochPeriod, epoch, now, emitter }: ProcessEpochParams) {
  const { chainId, network } = route;
  const { veaInbox, veaOutbox, veaInboxProvider, veaOutboxProvider, veaRouterProvider } = connections;
  let track = route.epochs.get(epoch);
  if (!track) {
    track = { nullStreak: 0, done: false, undecidableStreak: 0 };
    route.epochs.set(epoch, track);
  }
  const key = claimHandlerKey(chainId, network, epoch);
  const failures: string[] = [];
  let outcome: EpochOutcome | undefined;
  const reportOutcome = (reported: EpochOutcome) => {
    outcome = mergeOutcomes(outcome, reported);
  };
  let claim: Awaited<ReturnType<typeof getClaim>> = null;
  let claimFetched = false;
  let handlerReturned = false;

  try {
    claim = await getClaim({ network, chainId, veaOutbox, veaOutboxProvider, epoch, epochPeriod, emitter });
    claimFetched = true;
  } catch (error) {
    failures.push(`getClaim: ${errorMessage(error)}`);
  }
  if (claim) {
    const claimed = Number(claim.timestampClaimed);
    if (claimed > 0 && claimed > (route.newestClaimTimestamp ?? 0)) route.newestClaimTimestamp = claimed;
  }

  if (claimFetched) {
    const transactionHandler = () =>
      (state.transactionHandlers[key] ??= buildHandler(route, connections, epoch, emitter));
    // Each helper is isolated, so a challenger throw does not stop the claimer's work on the same epoch.
    if (path > BotPaths.CLAIMER && claim != null) {
      try {
        const checkAndChallengeResolveDeps: ChallengeAndResolveClaimParams = {
          chainId,
          claim,
          epoch,
          epochPeriod,
          veaInbox,
          veaInboxProvider,
          veaOutboxProvider,
          veaRouterProvider,
          veaOutbox,
          transactionHandler: transactionHandler(),
          emitter,
          reportOutcome,
        };
        if (await challengeAndResolveClaim(checkAndChallengeResolveDeps)) handlerReturned = true;
      } catch (error) {
        failures.push(`challengeAndResolveClaim: ${errorMessage(error)}`);
      }
    }
    if (path == BotPaths.CLAIMER || path == BotPaths.BOTH) {
      try {
        // No `now` here ([L9]): checkAndClaim takes milliseconds and defaults to chain time itself.
        const checkAndClaimParams: CheckAndClaimParams = {
          network,
          chainId,
          claim,
          epoch,
          epochPeriod,
          veaInbox,
          veaInboxProvider,
          veaOutboxProvider,
          veaRouterProvider,
          veaOutbox,
          transactionHandler: transactionHandler(),
          emitter,
          reportOutcome,
        };
        if (await checkAndClaim(checkAndClaimParams)) handlerReturned = true;
      } catch (error) {
        failures.push(`checkAndClaim: ${errorMessage(error)}`);
      }
    }
  }

  const failed = failures.length > 0;
  for (const message of failures) emitter.emit(BotEvents.EPOCH_FAILED, { chainId, network, epoch, message });

  // [L8] keep and exit state.
  const keep =
    failed ||
    claim != null ||
    outcome === EpochOutcome.PENDING ||
    outcome === EpochOutcome.UNDECIDABLE ||
    (outcome === undefined && handlerReturned);
  track.nullStreak = keep ? 0 : track.nullStreak + 1;
  track.done = !failed && outcome === EpochOutcome.DONE;

  // [L3] undecidable streak, from (E+1)·P + 3600 s of chain time.
  if (now >= (epoch + 1) * epochPeriod + UNDECIDABLE_GRACE_SECS) {
    if (failed || outcome === EpochOutcome.UNDECIDABLE) {
      track.undecidableStreak++;
      if (track.undecidableStreak % UNDECIDABLE_CYCLES_TO_ALERT == 0) {
        emitter.emit(BotEvents.ALERT, {
          level: "error",
          code: "epoch_undecidable",
          chainId,
          network,
          epoch,
          details: { consecutiveCycles: track.undecidableStreak },
        });
      }
    } else {
      track.undecidableStreak = 0;
    }
  }
}

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
