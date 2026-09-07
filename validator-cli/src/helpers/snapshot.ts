import { ZeroHash } from "ethers";
import { Network, snapshotSavingPeriod } from "../consts/bridgeRoutes";
import { getLastMessageSaved, getLastClaimedEpoch } from "../utils/graphQueries";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
interface SnapshotCheckParams {
  epochPeriod: number;
  chainId: number;
  veaInbox: any;
  veaOutbox: any;
  count: number;
  fetchLastSavedMessage?: typeof getLastMessageSaved;
  fetchLastClaimedEpoch?: typeof getLastClaimedEpoch;
}

export interface SaveSnapshotParams {
  chainId: number;
  veaInbox: any;
  veaOutbox: any;
  network: Network;
  epochPeriod: number;
  count: number;
  transactionHandler: any;
  emitter?: typeof defaultEmitter;
  toSaveSnapshot?: typeof isSnapshotNeeded;
  now: number;
}

export const saveSnapshot = async ({
  chainId,
  veaInbox,
  veaOutbox,
  network,
  epochPeriod,
  count,
  transactionHandler,
  emitter = defaultEmitter,
  toSaveSnapshot = isSnapshotNeeded,
  now = Math.floor(Date.now() / 1000),
}: SaveSnapshotParams): Promise<any> => {
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
    count,
  });
  if (!snapshotNeeded) return { transactionHandler, latestCount };
  await transactionHandler.saveSnapshot();
  return { transactionHandler, latestCount };
};

export const isSnapshotNeeded = async ({
  epochPeriod,
  chainId,
  veaInbox,
  veaOutbox,
  count,
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
    const saveSnapshotLogs = await veaInbox.queryFilter(veaInbox.filters.SnapshotSaved());
    lastSavedCount = Number(saveSnapshotLogs[saveSnapshotLogs.length - 1].args[2]);
    lastSavedSnapshot = saveSnapshotLogs[saveSnapshotLogs.length - 1].args[0];
    const lastClaimLogs = await veaOutbox.queryFilter(veaOutbox.filters.Claimed());
    lastClaimedStateroot = lastClaimLogs[lastClaimLogs.length - 1].data;
  } catch {
    const snapshotRes = await fetchLastSavedMessage(veaInbox.target, chainId);
    if (!snapshotRes) {
      return { snapshotNeeded: false, latestCount: currentCount };
    }
    const { id: lastSavedMessageId, stateRoot: lastSavedStateRoot } = snapshotRes;
    const messageIndex = extractMessageIndex(lastSavedMessageId);
    lastSavedSnapshot = lastSavedStateRoot;
    lastSavedCount = messageIndex;
    const lastClaimData = await fetchLastClaimedEpoch(veaOutbox.target, chainId);
    lastClaimedStateroot = lastClaimData ? lastClaimData.stateRoot : null;
  }
  const epochNow = Math.floor(Date.now() / (1000 * epochPeriod));
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
