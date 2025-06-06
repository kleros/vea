import { JsonRpcProvider } from "@ethersproject/providers";
import { getBridgeConfig } from "../consts/bridgeRoutes";

interface EpochRangeParams {
  chainId: number;
  epochPeriod: number;
  currentTimestamp: number;
  now?: number;
  fetchBridgeConfig?: typeof getBridgeConfig;
}

/**
 * Sets the epoch range to check for claims.
 *
 * @param currentTimestamp - The current timestamp
 * @param chainId - The chain ID
 * @param now - The current time in milliseconds (optional, defaults to Date.now())
 * @param fetchBridgeConfig - The function to fetch the bridge configuration (optional, defaults to getBridgeConfig)
 *
 * @returns The epoch range to check for claims
 */

const setEpochRange = ({
  chainId,
  currentTimestamp,
  epochPeriod,
  now = Date.now(),
  fetchBridgeConfig = getBridgeConfig,
}: EpochRangeParams): Array<number> => {
  const { sequencerDelayLimit } = fetchBridgeConfig(chainId);
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
  const length = veaEpochOutboxClaimableNow - veaEpochOutboxWatchLowerBound;
  const veaEpochOutboxCheckClaimsRangeArray: number[] = Array.from(
    { length },
    (_, i) => veaEpochOutboxWatchLowerBound + i + 1
  );
  return veaEpochOutboxCheckClaimsRangeArray;
};

const getLatestChallengeableEpoch = (epochPeriod: number, now: number = Date.now()): number => {
  return Math.floor(now / 1000 / epochPeriod) - 2;
};

/**
 * Get the block number corresponding to a given epoch.
 *
 * @param epoch - The epoch number
 * @param epochPeriod - The epoch period in seconds
 * @param provider - The JSON-RPC provider
 *
 * @returns The block number corresponding to the given epoch
 */
const getBlockFromEpoch = async (epoch: number, epochPeriod: number, provider: JsonRpcProvider): Promise<number> => {
  const epochTimestamp = epoch * epochPeriod;
  const latestBlock = await provider.getBlock("final");
  const baseBlock = await provider.getBlock(latestBlock.number - 500);
  const secPerBlock = (latestBlock.timestamp - baseBlock.timestamp) / (latestBlock.number - baseBlock.number);
  const blockFallBack = Math.floor((latestBlock.timestamp - epochTimestamp) / secPerBlock);
  return latestBlock.number - blockFallBack;
};

export { setEpochRange, getLatestChallengeableEpoch, getBlockFromEpoch, EpochRangeParams };
