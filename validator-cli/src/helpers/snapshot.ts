import { ZeroHash } from "ethers";
import { Network, getBridgeConfig, snapshotSavingPeriod } from "../consts/bridgeRoutes";
import { ClaimData, getClaimForEpoch, getLastClaimedEpoch, getLastMessageSaved } from "../utils/graphQueries";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
interface SnapshotCheckParams {
  network: Network;
  epochPeriod: number;
  chainId: number;
  veaInbox: any;
  veaOutbox: any;
  count: number;
  fetchLastSavedMessage?: typeof getLastMessageSaved;
  fetchLastClaimedEpoch?: typeof getLastClaimedEpoch;
  fetchClaimForEpoch?: typeof getClaimForEpoch;
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
    network,
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
  network,
  epochPeriod,
  chainId,
  veaInbox,
  veaOutbox,
  count,
  fetchLastSavedMessage = getLastMessageSaved,
  fetchLastClaimedEpoch = getLastClaimedEpoch,
  fetchClaimForEpoch = getClaimForEpoch,
}: SnapshotCheckParams): Promise<{ snapshotNeeded: boolean; latestCount: number }> => {
  const currentCount = Number(await veaInbox.count());

  if (count == currentCount) {
    return { snapshotNeeded: false, latestCount: currentCount };
  }
  let lastSavedCount: number;
  let lastSavedSnapshot: string;
  let lastClaimedEpoch: string;

  try {
    const saveSnapshotLogs = await veaInbox.queryFilter(veaInbox.filters.SnapshotSaved());
    lastSavedCount = Number(saveSnapshotLogs[saveSnapshotLogs.length - 1].args[2]);
    lastSavedSnapshot = saveSnapshotLogs[saveSnapshotLogs.length - 1].args[0];

    const lastClaimLogs = await veaOutbox.queryFilter(veaOutbox.filters.Claimed());
    lastClaimedEpoch = lastClaimLogs[lastClaimLogs.length - 1].args[1].toString();
  } catch {
    const veaInboxAddress = await veaInbox.getAddress();
    const snapshotRes = await fetchLastSavedMessage(veaInboxAddress, chainId);
    if (!snapshotRes) {
      return { snapshotNeeded: false, latestCount: currentCount };
    }
    const { id: lastSavedMessageId, stateRoot: lastSavedStateRoot } = snapshotRes;
    const messageIndex = extractMessageIndex(lastSavedMessageId);
    lastSavedSnapshot = lastSavedStateRoot;
    lastSavedCount = messageIndex;

    const lastClaimRes = await fetchLastClaimedEpoch(veaInboxAddress, chainId);
    lastClaimedEpoch = lastClaimRes !== undefined ? lastClaimRes.toString() : "0";
  }
  const epochNow = Math.floor(Date.now() / (1000 * epochPeriod));
  const currentSnapshot = await veaInbox.snapshots(epochNow);
  const currentStateRoot = await veaOutbox.stateRoot();
  const { routeConfig } = getBridgeConfig(chainId);

  const veaOutboxAddress = routeConfig[network].veaOutbox.address;
  let lastClaim: ClaimData | null;
  try {
    lastClaim = await fetchClaimForEpoch(Number(lastClaimedEpoch), veaOutboxAddress, chainId);
  } catch {
    lastClaim = null;
  }
  if (currentCount > lastSavedCount) {
    return { snapshotNeeded: true, latestCount: currentCount };
  } else if (currentSnapshot == ZeroHash && lastSavedSnapshot != currentStateRoot) {
    if (lastClaim && lastClaim.stateroot === lastSavedSnapshot) {
      if (lastClaim.challenge != null) {
        return { snapshotNeeded: true, latestCount: currentCount };
      }
      return { snapshotNeeded: false, latestCount: currentCount };
    }
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
