import { InvalidBotPathError, InvalidNetworkError } from "./errors";
import { Network } from "../consts/bridgeRoutes";
require("dotenv").config();

export enum BotPaths {
  CLAIMER = 0, // happy path
  CHALLENGER = 1, // unhappy path
  BOTH = 2, // both happy and unhappy path
}

interface BotPathParams {
  cliCommand: string[];
  defaultPath?: BotPaths;
}

/**
 * Get the bot path from the command line arguments
 * @param defaultPath - default path to use if not specified in the command line arguments
 * @returns BotPaths - the bot path (BotPaths)
 */
export function getBotPath({ cliCommand, defaultPath = BotPaths.BOTH }: BotPathParams): {
  path: number;
  toSaveSnapshot: boolean;
} {
  const args = cliCommand.slice(2);
  const pathFlag = args.find((arg) => arg.startsWith("--path="));

  const path = pathFlag ? pathFlag.split("=")[1] : null;

  const pathMapping: Record<string, BotPaths> = {
    claimer: BotPaths.CLAIMER,
    challenger: BotPaths.CHALLENGER,
    both: BotPaths.BOTH,
  };

  if (path && !(path in pathMapping)) {
    throw new InvalidBotPathError();
  }
  const saveSnapshotFlag = args.find((a) => a.startsWith("--saveSnapshot"));
  const toSaveSnapshot = saveSnapshotFlag ? true : false;
  return path ? { path: pathMapping[path], toSaveSnapshot } : { path: defaultPath, toSaveSnapshot };
}

export interface NetworkConfig {
  chainId: number;
  networks: Network[];
}

/**
 * Get the network configuration: chainId, networks, and devnet owner
 * @returns NetworkConfig[] - the network configuration
 */
export function getNetworkConfig(): NetworkConfig[] {
  const chainIds = process.env.VEAOUTBOX_CHAINS ? process.env.VEAOUTBOX_CHAINS.split(",") : [];
  const rawNetwork = process.env.NETWORKS ? process.env.NETWORKS.split(",") : [];
  const networks = validateNetworks(rawNetwork);

  const networkConfig: NetworkConfig[] = [];
  for (const chainId of chainIds) {
    networkConfig.push({
      chainId: Number(chainId),
      networks,
    });
  }
  return networkConfig;
}

function validateNetworks(networks: string[]): Network[] {
  const validNetworks = Object.values(Network);
  for (const network of networks) {
    if (!validNetworks.includes(network as Network)) {
      throw new InvalidNetworkError(network);
    }
  }
  return networks as unknown as Network[];
}
