import { ZeroHash } from "ethers";
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
import { getClaim, ClaimScanBudget } from "./utils/claim";
import { ClaimScanPausedError } from "./utils/errors";
import { DEFAULT_CHUNK_SIZE } from "./utils/logScanner";
import { CheckAndClaimParams, checkAndClaim } from "./helpers/claimer";
import { ChallengeAndResolveClaimParams, challengeAndResolveClaim } from "./helpers/validator";
import { saveSnapshot, SaveSnapshotParams, SnapshotSavedCache } from "./helpers/snapshot";
import { getTransactionHandler } from "./utils/transactionHandlers";
import { validateEnvironment } from "./utils/envValidation";
import { EpochOutcome, mergeOutcomes } from "./utils/epochOutcome";
import { getClaimedEpochsBelow, getIndexedBlock } from "./utils/graphQueries";
import { getOutboxReadBlock } from "./utils/arbToEthState";

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
// The cold start reads the claim hashes of older claimed epochs this many at a time. Reads made
// together go out as one JSON-RPC batch, and some endpoints refuse a batch of more than 3.
const CLAIM_HASH_READS_PER_BATCH = 3;
// COLD_START_DISCOVERY_FAILED is raised on the first failed cycle and again after each this many more.
const DISCOVERY_FAILURES_TO_REALERT = 15;
// The cold start reads at most this many batches of claim hashes per cycle; the rest of its queue
// resumes next cycle, so a long claim history never holds up the next route, heartbeat or shutdown.
const DISCOVERY_BATCHES_PER_CYCLE = 20;
// The blocks of claim-log scans a cycle spends on epochs older than the watch window, across all of
// them: an old claim's scan runs from its claim to the read block, and resumes next cycle.
const BACKLOG_CLAIM_SCAN_BLOCKS_PER_CYCLE = 50 * DEFAULT_CHUNK_SIZE;

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
 * - `epochs`: on testnet every epoch examined, seeded by the cold start or found by its
 *   discovery of older claims, and not yet left; on devnet only the current epoch (older ones
 *   leave at rollover).
 * - `coldStartDone`: set once the cold-start range is seeded on the route's first cycle.
 * - `discoverClaimsBelow`: the oldest epoch the cold start seeded, set with it on testnet. While
 *   set, each cycle ends by discovering the claimed epochs below it; cleared once all are read.
 * - `discoveryQueue`: the claimed epochs below it the indexer listed whose claim hash is not read
 *   yet; the cycle after a failed or capped one resumes at the first one left, without asking the
 *   indexer again.
 * - `discoveryFailures`: consecutive cycles whose discovery failed (0 once one succeeds).
 * - `firstCycleTime`: outbox chain time of the route's first cycle (liveness baseline with no claim).
 * - `newestClaimTimestamp`: the newest `timestampClaimed` fetched so far; never decreases.
 * - `lastLivenessAlarm`: chain time of the last LIVENESS_ALARM; one alarm per 24 h at most.
 * - `snapshotCount`: the inbox count saveSnapshot last returned (-1 before the first), valid only
 *   in `snapshotCountEpoch`, the epoch it was returned in. A cycle in any other epoch passes -1,
 *   so each epoch decides afresh even when no message arrived (an epoch whose claim was missed
 *   needs the same root saved again). Within one epoch a "not needed" answer at the same count
 *   stays valid: a save by anyone, a claim or a new state root only make a save less needed.
 * - `snapshotSaved`: the inbox's last SnapshotSaved as far as its chain was scanned, kept across
 *   epochs (`SnapshotSavedCache`), so each epoch's first check scans only the blocks since.
 * - `backlogCursor`: the oldest epoch below the window picked last cycle; the next cycle
 *   continues below it and wraps back to the newest one once none is left.
 */
interface RouteState {
  chainId: number;
  network: Network;
  epochs: Map<number, EpochTrack>;
  coldStartDone: boolean;
  discoverClaimsBelow?: number;
  discoveryQueue?: number[];
  discoveryFailures?: number;
  firstCycleTime?: number;
  newestClaimTimestamp?: number;
  lastLivenessAlarm?: number;
  snapshotCount: number;
  snapshotCountEpoch?: number;
  snapshotSaved?: SnapshotSavedCache;
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
  /** The most batches of claim hashes the cold-start discovery reads per cycle (default `DISCOVERY_BATCHES_PER_CYCLE`). */
  discoveryBatchesPerCycle?: number;
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
 *   epochs older than the watch window per cycle; `discoveryBatchesPerCycle`: the cap on the
 *   cold-start discovery's claim-hash batches per cycle; `state`: the loop's state
 *
 */

export const watch = async (
  shutDownSignal: ShutdownSignal = new ShutdownSignal(),
  emitter: typeof defaultEmitter = defaultEmitter,
  {
    cycleDelayMs = CYCLE_DELAY_MS,
    backlogEpochsPerCycle = BACKLOG_EPOCHS_PER_CYCLE,
    discoveryBatchesPerCycle = DISCOVERY_BATCHES_PER_CYCLE,
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
          { backlogEpochsPerCycle, discoveryBatchesPerCycle },
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
  {
    backlogEpochsPerCycle,
    discoveryBatchesPerCycle,
  }: { backlogEpochsPerCycle: number; discoveryBatchesPerCycle: number },
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
        discoveryBatchesPerCycle,
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
  // A transaction of its handler still unmined is not lost with it: the next send of ours to that
  // chain re-broadcasts it unchanged while it is stuck (`unminedSends`, baseTransactionHandler.ts).
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
  discoveryBatchesPerCycle: number;
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
  discoveryBatchesPerCycle,
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

  // Shared by this cycle's epochs below the window (their claim-log and SnapshotSent scans); the
  // window's own scans are never budgeted.
  const backlogScanBudget: ClaimScanBudget = { blocksLeft: BACKLOG_CLAIM_SCAN_BLOCKS_PER_CYCLE };
  for (const epoch of toWatch) {
    if (shutDownSignal.getIsShutdownSignal()) return;
    const scanBudget = windowLow !== undefined && epoch < windowLow ? backlogScanBudget : undefined;
    await processEpoch({ path, route, state, connections, epochPeriod, epoch, now, emitter, scanBudget });
    examined.add(epoch);
  }

  // Only after this cycle's epochs, so the indexer and the reads never delay the claimable one.
  if (route.discoverClaimsBelow !== undefined) {
    await discoverOlderClaims(route, connections, { epochPeriod, discoveryBatchesPerCycle, shutDownSignal, emitter });
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
 * disputes it started earlier; claims older than the range are found later (`discoverOlderClaims`).
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
    route.discoverClaimsBelow = Math.min(currentEpoch, ...epochRange);
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

/**
 * Cold-start discovery of claims older than the seeded range. The contracts put no age limit on
 * challenging an unverified claim or withdrawing a resolved deposit, so a restarted bot must still
 * watch every claim left on the outbox, not only the last week's. The indexer lists the claimed
 * epochs below the range; an epoch is added only when its `claimHashes(E)` is non-zero at the
 * outbox read block (zero: withdrawn, nothing left), read `CLAIM_HASH_READS_PER_BATCH` at a time
 * (`readClaimHashes`). Added epochs lie below the window: they join the backlog and leave through
 * `pruneAgedEpochs`.
 *
 * The list is read only after the indexer reports it has processed the outbox chain past the last
 * block such a claim can be in, (below+1)·P (`assertIndexedPast`): one still syncing would miss some.
 *
 * Each epoch is added once its hash is read: on a failure the epochs read so far stay, the next
 * cycle resumes at the first one left (`discoveryQueue`), and COLD_START_DISCOVERY_FAILED is raised
 * on the first failed cycle and after every DISCOVERY_FAILURES_TO_REALERT more. It never fails the route.
 * A cycle reads at most `discoveryBatchesPerCycle` batches, and none once shutdown is asked: the
 * queue resumes next cycle.
 */
async function discoverOlderClaims(
  route: RouteState,
  connections: RouteConnections,
  {
    epochPeriod,
    discoveryBatchesPerCycle,
    shutDownSignal,
    emitter,
  }: {
    epochPeriod: number;
    discoveryBatchesPerCycle: number;
    shutDownSignal: ShutdownSignal;
    emitter: typeof defaultEmitter;
  }
) {
  const { chainId, network } = route;
  const below = route.discoverClaimsBelow!;
  try {
    if (route.discoveryQueue === undefined) {
      // Checked before listing: a list read while the indexer was still short of the threshold
      // would miss the claims it indexed between the two reads, even once the check passes.
      await assertIndexedPast(chainId, (below + 1) * epochPeriod, connections.veaOutboxProvider);
      const listed = await getClaimedEpochsBelow(connections.veaOutbox.target, below, chainId);
      route.discoveryQueue = [...listed];
    }
    const queue = route.discoveryQueue;
    if (queue.length > 0) {
      const readBlock = await getOutboxReadBlock({ outboxProvider: connections.veaOutboxProvider, emitter });
      for (let batches = 0; queue.length > 0; batches++) {
        if (batches >= discoveryBatchesPerCycle || shutDownSignal.getIsShutdownSignal()) {
          route.discoveryFailures = 0;
          return;
        }
        const batch = queue.slice(0, CLAIM_HASH_READS_PER_BATCH);
        const hashes = await readClaimHashes(connections.veaOutbox, batch, readBlock.number);
        batch.forEach((epoch, j) => {
          if (hashes[j] == ZeroHash || route.epochs.has(epoch)) return;
          route.epochs.set(epoch, { nullStreak: 0, done: false, undecidableStreak: 0 });
        });
        queue.splice(0, batch.length);
      }
    }
    route.discoverClaimsBelow = undefined;
    route.discoveryQueue = undefined;
    route.discoveryFailures = 0;
  } catch (error) {
    route.discoveryFailures = (route.discoveryFailures ?? 0) + 1;
    if ((route.discoveryFailures - 1) % DISCOVERY_FAILURES_TO_REALERT != 0) return;
    emitter.emit(BotEvents.ALERT, {
      level: "warn",
      code: "COLD_START_DISCOVERY_FAILED",
      chainId,
      network,
      details: {
        belowEpoch: below,
        failedCycles: route.discoveryFailures,
        epochsLeft: route.discoveryQueue?.length,
        message: errorMessage(error),
      },
    });
  }
}

/**
 * Throws unless the indexer has processed outbox chain `chainId` up to chain time `timestamp`.
 * A block our endpoint does not know yet (null) is past it: `timestamp` lies behind the head.
 */
const assertIndexedPast = async (chainId: number, timestamp: number, outboxProvider: any): Promise<void> => {
  const indexed = await getIndexedBlock(chainId);
  const block = indexed === undefined ? undefined : await outboxProvider.getBlock(indexed);
  if (indexed === undefined || (block && block.timestamp < timestamp)) {
    throw new Error(`Indexer has not processed chain ${chainId} up to time ${timestamp} (it is at block ${indexed})`);
  }
};

/**
 * `claimHashes(E)` of each epoch at `blockTag`, read together (one small JSON-RPC batch). A read
 * that failed is retried on its own, outside any batch, before the failure counts.
 */
const readClaimHashes = async (veaOutbox: any, epochs: number[], blockTag: number): Promise<string[]> => {
  const results = await Promise.allSettled(epochs.map((epoch) => veaOutbox.claimHashes(epoch, { blockTag })));
  const hashes: string[] = [];
  for (const [j, result] of results.entries()) {
    hashes.push(result.status === "fulfilled" ? result.value : await veaOutbox.claimHashes(epochs[j], { blockTag }));
  }
  return hashes;
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
  // A stale handler's save still unmined is re-broadcast by the next send to the inbox chain, as in dropEpoch.
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
      count: route.snapshotCountEpoch === currentEpoch ? route.snapshotCount : -1,
      savedCache: (route.snapshotSaved ??= {}),
      transactionHandler,
      emitter,
      now,
    };
    const { updatedTransactionHandler, latestCount } = await saveSnapshot(params);
    if (updatedTransactionHandler) state.transactionHandlers[key] = updatedTransactionHandler;
    route.snapshotCount = latestCount;
    route.snapshotCountEpoch = currentEpoch;
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
  /** Set for an epoch below the watch window: the cycle's shared budget for its claim-log and SnapshotSent scans. */
  scanBudget?: ClaimScanBudget;
}

/** What one cycle's work on an epoch produced, before the keep/exit bookkeeping. */
interface EpochCycleResult {
  claim: Awaited<ReturnType<typeof getClaim>>;
  outcome: EpochOutcome | undefined;
  failures: string[];
  handlerReturned: boolean;
}

async function processEpoch(params: ProcessEpochParams) {
  const { route, epoch, epochPeriod, now, emitter } = params;
  const { chainId, network } = route;
  let track = route.epochs.get(epoch);
  if (!track) {
    track = { nullStreak: 0, done: false, undecidableStreak: 0 };
    route.epochs.set(epoch, track);
  }

  const result = await runEpochHelpers(params);
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
  scanBudget,
}: ProcessEpochParams): Promise<EpochCycleResult> {
  const { chainId, network } = route;
  const { veaInbox, veaOutbox, veaInboxProvider, veaOutboxProvider, veaRouterProvider } = connections;
  const result: EpochCycleResult = { claim: null, outcome: undefined, failures: [], handlerReturned: false };
  const reportOutcome = (reported: EpochOutcome) => {
    result.outcome = mergeOutcomes(result.outcome, reported);
  };

  try {
    result.claim = await getClaim({
      network,
      chainId,
      veaOutbox,
      veaOutboxProvider,
      epoch,
      epochPeriod,
      emitter,
      scanBudget,
    });
  } catch (error) {
    // The cycle's scan budget ran out: undecidable until the scan resumes next visit, no failure.
    if (error instanceof ClaimScanPausedError) result.outcome = EpochOutcome.UNDECIDABLE;
    else result.failures.push(`getClaim: ${errorMessage(error)}`);
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
        scanBudget,
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
