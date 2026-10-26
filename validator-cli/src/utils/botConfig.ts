import { InvalidBotPathError, InvalidNetworkError, InvalidChainIdError } from "./errors";
import { Network, bridges } from "../consts/bridgeRoutes";
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
 * Split a comma-separated environment list: entries are trimmed and empty ones dropped. The
 * startup preflight and the watcher both read VEAOUTBOX_CHAINS and NETWORKS through this, so
 * a list the preflight accepts (`11155111, 10200`, a trailing comma) is the list the bot runs.
 */
export const splitList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/** Repeated entries dropped, first occurrence kept: a route listed twice runs once. */
const unique = (list: string[]): string[] => [...new Set(list)];

/**
 * Get the network configuration: chainId, networks, and devnet owner
 * @returns NetworkConfig[] - the network configuration
 */
export function getNetworkConfig(): NetworkConfig[] {
  // Read as numbers, as the preflight reads them: `011155111` is chain 11155111.
  const chainIds = unique(splitList(process.env.VEAOUTBOX_CHAINS).map((id) => String(Number(id))));
  validateChainId(chainIds);
  const networks = validateNetworks(unique(splitList(process.env.NETWORKS)));

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

function validateChainId(chainIds: string[]): void {
  for (const chainId of chainIds) {
    if (!bridges[chainId]) {
      throw new InvalidChainIdError(chainId);
    }
  }
}
