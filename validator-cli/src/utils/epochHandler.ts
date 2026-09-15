import { JsonRpcProvider } from "@ethersproject/providers";
import { getBridgeConfig } from "../consts/bridgeRoutes";
// DONT DECLARE A NEW var here, i think this wont be needed after we update the lowerbound comment i made below
// Extra backlog for the cold-start epoch sweep, so a restart still picks up
// claims that were pending L2 finalization when the bot went down.
const COLD_START_BACKLOG_SECS = 7 * 24 * 60 * 60;

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

  // When Sequencer is malicious, even when L1 is finalized, L2 state might be unknown for up to  sequencerDelayLimit + epochPeriod.
  const L2SyncPeriod = sequencerDelayLimit + epochPeriod;
  // When we start the watcher, we need to go back far enough to check for claims which may have been pending L2 state finalization.
  const veaEpochOutboxWatchLowerBound =
    Math.floor((currentTimestamp - L2SyncPeriod - COLD_START_BACKLOG_SECS) / epochPeriod) - 2;
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

interface BlockAtTimestampParams {
  provider: JsonRpcProvider;
  timestamp: number;
  floorBlock?: number;
  headBlockTag?: "latest" | "finalized";
}

// Blocks sampled back from the head to observe the chain's recent block rate.
const BLOCK_RATE_SAMPLE_SIZE = 1000;
// Chains differ by orders of magnitude (Arbitrum ~0.25s, Ethereum ~12s), so the
// rate is measured rather than configured. This only guards against divide-by-zero.
const MIN_SECONDS_PER_BLOCK = 0.05;

/**
 * Find the block that contains a given timestamp.
 *
 * Returns the highest block number whose timestamp is at or before `timestamp`.
 *
 * Runs in three steps: estimate where the target sits from the chain's recent
 * block rate, widen that estimate backwards until it really is behind the
 * target, then bisect. The estimate matters because anchoring the search at
 * block 0 would cost a pointless round trip to genesis and make the starting
 * bracket the entire chain; the widening step is what keeps the result correct
 * when the chain's rate has changed and the estimate is therefore wrong.
 *
 * @returns The block number containing `timestamp`
 */
const blockAtTimestamp = async ({
  provider,
  timestamp,
  floorBlock = 0,
  headBlockTag = "finalized",
}: BlockAtTimestampParams): Promise<number> => {
  const headBlock = await provider.getBlock(headBlockTag);
  if (timestamp >= headBlock.timestamp) return headBlock.number;

  const sampleNumber = Math.max(headBlock.number - BLOCK_RATE_SAMPLE_SIZE, floorBlock);
  const sampleBlock = await provider.getBlock(sampleNumber);
  const secondsPerBlock = Math.max(
    (headBlock.timestamp - sampleBlock.timestamp) / Math.max(headBlock.number - sampleNumber, 1),
    MIN_SECONDS_PER_BLOCK
  );

  let span = Math.ceil((headBlock.timestamp - timestamp) / secondsPerBlock);
  let low = Math.max(headBlock.number - span, floorBlock);
  let lowBlock = await provider.getBlock(low);
  while (lowBlock.timestamp > timestamp && low > floorBlock) {
    span *= 2;
    low = Math.max(headBlock.number - span, floorBlock);
    lowBlock = await provider.getBlock(low);
  }
  if (lowBlock.timestamp > timestamp) return floorBlock;

  let high = headBlock.number;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    const block = await provider.getBlock(middle);
    if (block.timestamp <= timestamp) low = middle;
    else high = middle;
  }
  return low;
};

interface LookbackFloorParams {
  provider: JsonRpcProvider;
  chainId: number;
  epochPeriod: number;
  headBlockTag?: "latest" | "finalized";
  fetchBridgeConfig?: typeof getBridgeConfig;
}
// Logically the loop back should be limited to the sequencerDelayLimit + epochPeriod, but we add a backlog to account for the time it takes for the bot to start up and catch up with the chain. But i think thats too harsh and we should just use the sequencerDelayLimit + epochPeriod as the limit. Maybe 2 epoch periods?
/**
 * The oldest block worth searching for a "latest event of its kind" lookup.
 *
 * Bounded by the protocol's worst-case L2 sync window. This is a cheap on-chain
 * fast path with an indexer fallback behind it, so it deliberately does not
 * carry the cold-start backlog: `findLatestLog` scans backward with early exit,
 * meaning a wider floor costs nothing when events are recent and costs the most
 * when there are none to find. On Arbitrum the backlog would be ~2.4M blocks of
 * empty scanning before falling back to the indexer anyway.
 *
 * @returns The block number to stop searching backward at
 */
const getLookbackFloorBlock = async ({
  provider,
  chainId,
  epochPeriod,
  headBlockTag = "finalized",
  fetchBridgeConfig = getBridgeConfig,
}: LookbackFloorParams): Promise<number> => {
  const { sequencerDelayLimit } = fetchBridgeConfig(chainId);
  const headBlock = await provider.getBlock(headBlockTag);
  const floorTimestamp = headBlock.timestamp - (sequencerDelayLimit + epochPeriod);
  if (floorTimestamp <= 0) return 0;
  return blockAtTimestamp({ provider, timestamp: floorTimestamp, headBlockTag });
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
const getBlockFromEpoch = async (epoch: number, epochPeriod: number, provider: JsonRpcProvider): Promise<number> =>
  blockAtTimestamp({ provider, timestamp: epoch * epochPeriod });

export {
  setEpochRange,
  getLatestChallengeableEpoch,
  getBlockFromEpoch,
  blockAtTimestamp,
  getLookbackFloorBlock,
  EpochRangeParams,
};
