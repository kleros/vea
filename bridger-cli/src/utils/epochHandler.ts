import { JsonRpcProvider } from "@ethersproject/providers";
import { InvalidStartEpochError } from "./errors";
import { getBridgeConfig } from "../consts/bridgeRoutes";

/**
 * Sets the range of epochs from the start epoch to the current epoch.
 *
 * @param veaOutbox - The VeaOutbox instance to get the current epoch
 * @param startEpoch - The starting epoch number
 * @returns An array of epoch numbers from startEpoch to currentEpoch
 *
 * @example
 * const epochs = await setEpochRange(veaOutbox, 0);
 */
const setEpochRange = async (veaOutbox: any, startEpoch: number): Promise<Array<number>> => {
  const defaultEpochRollback = 10; // When no start epoch is provided, we will start from current epoch - defaultEpochRollback
  const currentEpoch = Number(await veaOutbox.epochNow());
  if (currentEpoch < startEpoch) {
    throw new InvalidStartEpochError(startEpoch);
  }
  if (startEpoch == 0) {
    startEpoch = currentEpoch - defaultEpochRollback;
  }
  const epochs: number[] = new Array(currentEpoch - startEpoch + 1).fill(startEpoch).map((el, i) => el + i);
  return epochs;
};

/**
 * Gets the block number for a given epoch.
 *
 * @param veaOutboxRpc - The VeaOutbox RPC instance to get the block number
 * @param epoch - The epoch number for which the block number is needed
 * @param epochPeriod - The epoch period in seconds
 *
 * @returns The block number for the given epoch
 *
 * @example
 * const blockNumber = await getBlockNumberFromEpoch(veaOutboxRpc, 240752, 7200);
 */
const getBlockNumberFromEpoch = async (
  veaOutboxRpc: JsonRpcProvider,
  epoch: number,
  epochPeriod: number
): Promise<number> => {
  const latestBlock = await veaOutboxRpc.getBlock("latest");
  const preBlock = await veaOutboxRpc.getBlock(latestBlock.number - 1000);
  const avgBlockTime = (latestBlock.timestamp - preBlock.timestamp) / 1000;

  const epochInSeconds = epoch * epochPeriod;
  const epochBlock = Math.floor(latestBlock.number - (latestBlock.timestamp - epochInSeconds) / avgBlockTime);
  return epochBlock - 100;
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

export { setEpochRange, getBlockNumberFromEpoch, getLatestVerifiableEpoch };
