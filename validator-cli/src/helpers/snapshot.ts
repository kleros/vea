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
  now?: number;
}

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
    veaInboxProvider,
    veaOutboxProvider,
    count,
  });
  if (!snapshotNeeded) return { transactionHandler, latestCount };
  await transactionHandler.saveSnapshot();
  return { transactionHandler, latestCount };
};

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
