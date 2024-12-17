import { getBridgeConfig } from "../consts/bridgeRoutes";

const setEpochRange = (
  currentTimestamp: number,
  chainId: number,
  now: number = Date.now(),
  fetchBridgeConfig: typeof getBridgeConfig = getBridgeConfig
): Array<number> => {
  const { sequencerDelayLimit, epochPeriod } = fetchBridgeConfig(chainId);
  const coldStartBacklog = 7 * 24 * 60 * 60; // when starting the watcher, specify an extra backlog to check

  // When Sequencer is malicious, even when L1 is finalized, L2 state might be unknown for up to  sequencerDelayLimit + epochPeriod.
  const L2SyncPeriod = sequencerDelayLimit + epochPeriod;
  // When we start the watcher, we need to go back far enough to check for claims which may have been pending L2 state finalization.
  const veaEpochOutboxWatchLowerBound =
    Math.floor((currentTimestamp - L2SyncPeriod - coldStartBacklog) / epochPeriod) - 2;
  // ETH / Gnosis POS assumes synchronized clocks
  // using local time as a proxy for true "latest" L1 time
  const timeLocal = Math.floor(now / 1000);

  let veaEpochOutboxClaimableNow = Math.floor(timeLocal / epochPeriod) - 1;
  // only past epochs are claimable, hence shift by one here
  const veaEpochOutboxRange = veaEpochOutboxClaimableNow - veaEpochOutboxWatchLowerBound;
  const veaEpochOutboxCheckClaimsRangeArray: number[] = new Array(veaEpochOutboxRange + 1)
    .fill(veaEpochOutboxWatchLowerBound)
    .map((el, i) => el + i);

  return veaEpochOutboxCheckClaimsRangeArray;
};

/**
 * Checks if a new epoch has started.
 *
 * @param currentVerifiableEpoch - The current verifiable epoch number
 * @param epochPeriod - The epoch period in seconds
 * @param now - The current time in milliseconds (optional, defaults to Date.now())
 *
 * @returns The updated epoch number
 *
 * @example
 * currentEpoch = checkForNewEpoch(currentEpoch, 7200);
 */
const getLatestVerifiableEpoch = (
  chainId: number,
  now: number = Date.now(),
  fetchBridgeConfig: typeof getBridgeConfig = getBridgeConfig
): number => {
  const { epochPeriod } = fetchBridgeConfig(chainId);
  return Math.floor(now / 1000 / epochPeriod) - 1;
};

export { setEpochRange, getLatestVerifiableEpoch };
