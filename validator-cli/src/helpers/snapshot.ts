import { ZeroHash } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getLookbackFloorBlock } from "../utils/epochHandler";
import { findLatestLog } from "../utils/logScanner";
import { NoMessageSavedError } from "../utils/errors";
import { Network, snapshotSavingPeriod } from "../consts/bridgeRoutes";
import { getLastMessageSaved, getLastClaimedEpoch } from "../utils/graphQueries";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
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
  fetchLastSavedMessage?: typeof getLastMessageSaved;
  fetchLastClaimedEpoch?: typeof getLastClaimedEpoch;
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
  await transactionHandler.saveSnapshot();
  return { transactionHandler, latestCount };
};

/** The outbox chain's latest block timestamp in seconds: the same clock the watcher's cycle uses. */
const chainNow = async (provider: JsonRpcProvider): Promise<number> => (await provider.getBlock("latest")).timestamp;

/**
 * Find the most recent matching log within the window that can still affect a
 * decision, expressed in the block numbers of that contract's own chain.
 *
 * @returns The newest matching log, or null if there is none in the window
 */
const findLatestLogWithinLookback = async (
  {
    contract,
    provider,
    chainId,
    epochPeriod,
  }: { contract: any; provider: JsonRpcProvider; chainId: number; epochPeriod: number },
  buildFilter: () => any
): Promise<any | null> => {
  const [floorBlock, headBlock] = await Promise.all([
    getLookbackFloorBlock({ provider, chainId, epochPeriod }),
    provider.getBlock("finalized"),
  ]);
  return findLatestLog({
    contract,
    filter: buildFilter(),
    fromBlock: floorBlock,
    toBlock: headBlock.number,
  });
};

export const isSnapshotNeeded = async ({
  epochPeriod,
  chainId,
  veaInbox,
  veaOutbox,
  veaInboxProvider,
  veaOutboxProvider,
  count,
  now,
  fetchLastSavedMessage = getLastMessageSaved,
  fetchLastClaimedEpoch = getLastClaimedEpoch,
}: SnapshotCheckParams): Promise<{ snapshotNeeded: boolean; latestCount: number }> => {
  const currentCount = Number(await veaInbox.count());

  if (count == currentCount) {
    return { snapshotNeeded: false, latestCount: currentCount };
  }
  let lastSavedCount: number;
  let lastSavedSnapshot: string;
  let lastClaimedStateroot: string | null;

  try {
    const [saveSnapshotLog, lastClaimLog] = await Promise.all([
      findLatestLogWithinLookback({ contract: veaInbox, provider: veaInboxProvider, chainId, epochPeriod }, () =>
        veaInbox.filters.SnapshotSaved()
      ),
      findLatestLogWithinLookback({ contract: veaOutbox, provider: veaOutboxProvider, chainId, epochPeriod }, () =>
        veaOutbox.filters.Claimed()
      ),
    ]);
    if (!saveSnapshotLog || !lastClaimLog) throw new NoMessageSavedError(String(veaInbox.target));
    lastSavedCount = Number(saveSnapshotLog.args[2]);
    lastSavedSnapshot = saveSnapshotLog.args[0];
    lastClaimedStateroot = lastClaimLog.data;
  } catch {
    const snapshotRes = await fetchLastSavedMessage(veaInbox.target, chainId);
    if (!snapshotRes) {
      // No snapshot was ever saved (neither on chain within the lookback nor in the indexer):
      // messages in the inbox are waiting for their first one. An extra save, if the indexer was
      // down rather than empty, rewrites the current epoch's snapshot with the same root.
      return { snapshotNeeded: currentCount > 0, latestCount: currentCount };
    }
    const { id: lastSavedMessageId, stateRoot: lastSavedStateRoot } = snapshotRes;
    const messageIndex = extractMessageIndex(lastSavedMessageId);
    lastSavedSnapshot = lastSavedStateRoot;
    lastSavedCount = messageIndex;
    const lastClaimData = await fetchLastClaimedEpoch(veaOutbox.target, chainId);
    lastClaimedStateroot = lastClaimData ? lastClaimData.stateRoot : null;
  }
  const epochNow = Math.floor((now ?? (await chainNow(veaOutboxProvider))) / epochPeriod);
  const currentSnapshot = await veaInbox.snapshots(epochNow);
  const currentStateRoot = await veaOutbox.stateRoot();
  if (currentCount > lastSavedCount) {
    return { snapshotNeeded: true, latestCount: currentCount };
  } else if (
    currentSnapshot == ZeroHash &&
    lastSavedSnapshot != currentStateRoot &&
    lastSavedSnapshot != lastClaimedStateroot
  ) {
    return { snapshotNeeded: true, latestCount: currentCount };
  }
  return { snapshotNeeded: false, latestCount: currentCount };
};

function extractMessageIndex(id: string): number {
  if (id === undefined) return 0;
  const parts = id.split("-");
  if (parts.length < 2) {
    throw new Error(`Invalid message-id format: ${id}`);
  }
  // everything after the first dash is the index
  const idxStr = parts.slice(1).join("-");
  const idx = parseInt(idxStr, 10);
  if (Number.isNaN(idx)) {
    throw new Error(`Cannot parse index from "${idxStr}"`);
  }
  return idx;
}
