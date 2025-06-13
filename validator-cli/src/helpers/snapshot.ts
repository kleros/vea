import { Network } from "../consts/bridgeRoutes";
import { getLastMessageSaved } from "../utils/graphQueries";
import { BotEvents } from "../utils/botEvents";
import { defaultEmitter } from "../utils/emitter";

interface SnapshotCheckParams {
  chainId: number;
  veaInbox: any;
  count: number;
  fetchLastSavedMessage?: typeof getLastMessageSaved;
}

export interface SaveSnapshotParams {
  chainId: number;
  veaInbox: any;
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
  network,
  epochPeriod,
  count,
  transactionHandler,
  emitter = defaultEmitter,
  toSaveSnapshot = isSnapshotNeeded,
  now = Math.floor(Date.now() / 1000),
}: SaveSnapshotParams): Promise<any> => {
  if (network != Network.DEVNET) {
    const timeElapsed = now % epochPeriod;
    const timeLeftForEpoch = epochPeriod - timeElapsed;
    // Saving snapshots in last 10 minutes of the epoch on testnet
    if (timeLeftForEpoch > 600) {
      emitter.emit(BotEvents.SNAPSHOT_WAITING, timeLeftForEpoch);
      return { transactionHandler, latestCount: count };
    }
  }
  const { snapshotNeeded, latestCount } = await toSaveSnapshot({
    chainId,
    veaInbox,
    count,
  });
  if (!snapshotNeeded) return { transactionHandler, latestCount };
  await transactionHandler.saveSnapshot();
  return { transactionHandler, latestCount };
};

export const isSnapshotNeeded = async ({
  chainId,
  veaInbox,
  count,
  fetchLastSavedMessage = getLastMessageSaved,
}: SnapshotCheckParams): Promise<{ snapshotNeeded: boolean; latestCount: number }> => {
  const currentCount = Number(await veaInbox.count());
  if (count == currentCount) {
    return { snapshotNeeded: false, latestCount: currentCount };
  }
  let lastSavedCount: number;
  try {
    const saveSnapshotLogs = await veaInbox.queryFilter(veaInbox.filters.SnapshotSaved());
    lastSavedCount = Number(saveSnapshotLogs[saveSnapshotLogs.length - 1].args[2]);
  } catch {
    const veaInboxAddress = await veaInbox.getAddress();
    const lastSavedMessageId = await fetchLastSavedMessage(veaInboxAddress, chainId);
    const messageIndex = extractMessageIndex(lastSavedMessageId);
    // adding 1 to the message index to get the last saved count
    lastSavedCount = messageIndex + 1;
  }
  if (currentCount > lastSavedCount) {
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
