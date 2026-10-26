import { ZeroHash } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getLookbackFloorBlock } from "../utils/epochHandler";
import { findLatestLog } from "../utils/logScanner";
import { Network, snapshotSavingPeriod } from "../consts/bridgeRoutes";
import { getLastSnapshotSaved, getLastClaimedEpoch } from "../utils/graphQueries";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";

type LastSaved = { count: number; stateRoot: string };

/**
 * The inbox's newest SnapshotSaved as of block `scannedTo` of its chain (`lastSaved` null: none
 * was ever saved), kept by the watcher per route across epochs. A check that finds it filled scans
 * only the blocks finalized since `scannedTo`, a chunk or two, rather than the whole lookback.
 */
export interface SnapshotSavedCache {
  scannedTo?: number;
  lastSaved?: LastSaved | null;
}

interface SnapshotCheckParams {
  epochPeriod: number;
  chainId: number;
  veaInbox: any;
  veaOutbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutboxProvider: JsonRpcProvider;
  count: number;
  /** Seconds. Defaults to the outbox chain's latest block timestamp, never the host clock. */
  now?: number;
  fetchLastSnapshotSaved?: typeof getLastSnapshotSaved;
  fetchLastClaimedEpoch?: typeof getLastClaimedEpoch;
  /** Read and updated in place; without one every check scans the whole lookback. */
  savedCache?: SnapshotSavedCache;
}

export interface SaveSnapshotParams {
  chainId: number;
  veaInbox: any;
  veaOutbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutboxProvider: JsonRpcProvider;
  network: Network;
  epochPeriod: number;
  count: number;
  transactionHandler: any;
  emitter?: typeof defaultEmitter;
  toSaveSnapshot?: typeof isSnapshotNeeded;
  /** Seconds. Defaults to the outbox chain's latest block timestamp, as the watcher passes it; never the host clock. */
  now?: number;
  /** The route's `SnapshotSavedCache`, passed on to the check. */
  savedCache?: SnapshotSavedCache;
}

// A snapshot is sent only while at least this long is left in its epoch on the inbox chain.
export const SEND_MARGIN_SECS = 30;

export const saveSnapshot = async ({
  chainId,
  veaInbox,
  veaOutbox,
  veaInboxProvider,
  veaOutboxProvider,
  network,
  epochPeriod,
  count,
  transactionHandler,
  emitter = defaultEmitter,
  toSaveSnapshot = isSnapshotNeeded,
  now,
  savedCache,
}: SaveSnapshotParams): Promise<any> => {
  now ??= await chainNow(veaOutboxProvider);
  const timeElapsed = now % epochPeriod;
  const timeLeftForEpoch = epochPeriod - timeElapsed;

  if (timeLeftForEpoch > snapshotSavingPeriod[network]) {
    emitter.emit(BotEvents.SNAPSHOT_WAITING, timeLeftForEpoch);
    return { transactionHandler, latestCount: count };
  }

  const { snapshotNeeded, latestCount } = await toSaveSnapshot({
    epochPeriod,
    chainId,
    veaInbox,
    veaOutbox,
    veaInboxProvider,
    veaOutboxProvider,
    count,
    now,
    savedCache,
  });
  if (!snapshotNeeded) return { transactionHandler, latestCount };
  // The checks above can take minutes (log scans), and the inbox files the snapshot under its own
  // chain's epoch at inclusion. Re-read the inbox chain's time and send only while the epoch
  // decided on still has SEND_MARGIN_SECS left; otherwise the snapshot would land in the next one.
  const epoch = Math.floor(now / epochPeriod);
  const inboxNow = await chainNow(veaInboxProvider);
  if (Math.floor((inboxNow + SEND_MARGIN_SECS) / epochPeriod) != epoch) {
    emitter.emit(BotEvents.ALERT, {
      level: "warn",
      code: "SNAPSHOT_EPOCH_ENDED",
      chainId,
      network,
      epoch,
      details: { inboxNow, epochEnd: (epoch + 1) * epochPeriod },
    });
    return { transactionHandler, latestCount: count };
  }
  // The handler is told the count to cover: a save of its own already mined that covers less is
  // superseded rather than waited for.
  await transactionHandler.saveSnapshot(latestCount);
  // The count passed in, not `latestCount`: the handler may have skipped the send (an earlier save
  // still pending), or the save may yet drop or revert, and a cached count ends the next check at
  // `count == currentCount` before any on-chain read. So the next cycle checks the chain again;
  // the handler, not this count, keeps a save in flight from being sent twice.
  return { transactionHandler, latestCount: count };
};

/** The outbox chain's latest block timestamp in seconds: the same clock the watcher's cycle uses. */
const chainNow = async (provider: JsonRpcProvider): Promise<number> => (await provider.getBlock("latest")).timestamp;

/**
 * Find the most recent matching log within the window that can still affect a
 * decision, expressed in the block numbers of that contract's own chain.
 *
 * @returns The newest matching log, or null if there is none in the window, and the window's
 *   last block (the chain's finalized block)
 */
const findLatestLogWithinLookback = async (
  {
    contract,
    provider,
    chainId,
    epochPeriod,
  }: { contract: any; provider: JsonRpcProvider; chainId: number; epochPeriod: number },
  buildFilter: () => any
): Promise<{ log: any | null; toBlock: number }> => {
  const [floorBlock, headBlock] = await Promise.all([
    getLookbackFloorBlock({ provider, chainId, epochPeriod }),
    provider.getBlock("finalized"),
  ]);
  const log = await findLatestLog({
    contract,
    filter: buildFilter(),
    fromBlock: floorBlock,
    toBlock: headBlock.number,
  });
  return { log, toBlock: headBlock.number };
};

const savedOf = (log: any): LastSaved => ({ count: Number(log.args[2]), stateRoot: log.args[0] });

/**
 * The inbox's newest SnapshotSaved up to its finalized block, from its logs: with `savedCache`
 * filled, scanned forward from its `scannedTo`; otherwise over the lookback. `lastSaved` is
 * undefined when the lookback holds none (the indexer then tells). Rejects when a scan fails.
 */
const scanLastSaved = async (
  {
    veaInbox,
    veaInboxProvider,
    chainId,
    epochPeriod,
  }: { veaInbox: any; veaInboxProvider: JsonRpcProvider; chainId: number; epochPeriod: number },
  savedCache: SnapshotSavedCache | undefined
): Promise<{ lastSaved?: LastSaved | null; scannedTo: number }> => {
  if (savedCache?.scannedTo === undefined) {
    const { log, toBlock } = await findLatestLogWithinLookback(
      { contract: veaInbox, provider: veaInboxProvider, chainId, epochPeriod },
      () => veaInbox.filters.SnapshotSaved()
    );
    return { lastSaved: log ? savedOf(log) : undefined, scannedTo: toBlock };
  }
  const { scannedTo } = savedCache;
  const head = (await veaInboxProvider.getBlock("finalized")).number;
  // A lagging endpoint after a failover can report an older head: then nothing new is scanned.
  const log =
    head > scannedTo
      ? await findLatestLog({
          contract: veaInbox,
          filter: veaInbox.filters.SnapshotSaved(),
          fromBlock: scannedTo + 1,
          toBlock: head,
        })
      : null;
  return { lastSaved: log ? savedOf(log) : savedCache.lastSaved ?? null, scannedTo: Math.max(head, scannedTo) };
};

/**
 * Whether the inbox needs a save: a message arrived after the last save (its SnapshotSaved log
 * within the lookback, read up to the inbox finalized block; with none there, the indexer's last
 * SnapshotSaved, whose count is the inbox count it saved as on chain), or, with no new message, the
 * last saved root was never claimed and the current epoch has no snapshot yet (a missed claim needs
 * that root saved again). The last claimed root is the outbox's last Claimed log; the indexer is
 * asked for it only when that log is missing, and its failure only skips that one check, for this
 * check alone: `latestCount` is then the `count` passed in, so the next one asks again.
 * With `savedCache`, the last save found by a scan that completed (or the indexer's, when that scan
 * found none) is kept, and later checks scan only the inbox blocks finalized since.
 */
export const isSnapshotNeeded = async ({
  epochPeriod,
  chainId,
  veaInbox,
  veaOutbox,
  veaInboxProvider,
  veaOutboxProvider,
  count,
  now,
  fetchLastSnapshotSaved = getLastSnapshotSaved,
  fetchLastClaimedEpoch = getLastClaimedEpoch,
  savedCache,
}: SnapshotCheckParams): Promise<{ snapshotNeeded: boolean; latestCount: number }> => {
  const currentCount = Number(await veaInbox.count());
  const notNeeded = { snapshotNeeded: false, latestCount: currentCount };

  if (count == currentCount) return notNeeded;

  // Each scan stands alone: a missing Claimed log, usual on a quiet outbox, leaves the
  // SnapshotSaved one as good as it is.
  const [saved, lastClaimLog] = await Promise.allSettled([
    scanLastSaved({ veaInbox, veaInboxProvider, chainId, epochPeriod }, savedCache),
    findLatestLogWithinLookback({ contract: veaOutbox, provider: veaOutboxProvider, chainId, epochPeriod }, () =>
      veaOutbox.filters.Claimed()
    ),
  ]);
  const lastSaved =
    saved.status === "fulfilled" && saved.value.lastSaved !== undefined
      ? saved.value.lastSaved
      : await fetchLastSnapshotSaved(veaInbox.target, chainId);
  // Kept only after a scan that completed: a failed one tells nothing of the blocks it missed.
  if (savedCache && saved.status === "fulfilled") {
    savedCache.lastSaved = lastSaved;
    savedCache.scannedTo = saved.value.scannedTo;
  }
  if (!lastSaved) {
    // No snapshot was ever saved (neither on chain within the lookback nor in the indexer):
    // messages in the inbox are waiting for their first one. An extra save, if the indexer was
    // down rather than empty, rewrites the current epoch's snapshot with the same root.
    return { snapshotNeeded: currentCount > 0, latestCount: currentCount };
  }
  if (currentCount > lastSaved.count) return { snapshotNeeded: true, latestCount: currentCount };

  const epochNow = Math.floor((now ?? (await chainNow(veaOutboxProvider))) / epochPeriod);
  const currentSnapshot = await veaInbox.snapshots(epochNow);
  const currentStateRoot = await veaOutbox.stateRoot();
  if (currentSnapshot != ZeroHash || lastSaved.stateRoot == currentStateRoot) return notNeeded;
  let lastClaimedStateroot: string | null;
  if (lastClaimLog.status === "fulfilled" && lastClaimLog.value.log) {
    lastClaimedStateroot = lastClaimLog.value.log.data;
  } else {
    try {
      const lastClaimData = await fetchLastClaimedEpoch(veaOutbox.target, chainId);
      lastClaimedStateroot = lastClaimData ? lastClaimData.stateRoot : null;
    } catch {
      // Whether the saved root was claimed cannot be told: no re-save on this check alone. The
      // count passed in, not `currentCount`, so the next check in the window asks again rather
      // than ending at `count == currentCount` for the rest of the epoch.
      return { snapshotNeeded: false, latestCount: count };
    }
  }
  return { snapshotNeeded: lastSaved.stateRoot != lastClaimedStateroot, latestCount: currentCount };
};
