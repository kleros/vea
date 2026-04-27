import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { claimLock, releaseLock } from "../lock";
import { BotEvents } from "../botEvents";
import { HashiMessage, HashiMessageExecutionVars } from "./hashiTypes";
require("dotenv").config();

/**
 * Get the block number to start relaying from by claiming the lock and reading the blockNumber from the state file.
 * If the state file does not exist, it will be created with the current timestamp and blockNumber 0.
 *
 * @param chainId Chain ID of the relayer
 * @param network Network name of the relayer (e.g. "testnet")
 * @param emitter EventEmitter instance
 *
 * @returns The nonce read from the state file
 */
async function getStartBlockNumber(
  chainId: number,
  network: string,
  emitter: EventEmitter,
  setLock: typeof claimLock = claimLock,
  syncStateFile: typeof updateHashiStateFile = updateHashiStateFile,
  fileSystem: typeof fs = fs
): Promise<number> {
  setLock(network, chainId);
  emitter.emit(BotEvents.LOCK_CLAIMED);
  // STATE_DIR is absolute path of the directory where the state files are stored
  // STATE_DIR must have trailing slash
  const stateDir = process.env.STATE_DIR || "";
  const stateFile = path.join(stateDir, `${network}_${chainId}.json`);
  if (!fileSystem.existsSync(stateFile)) {
    // No state file so initialize starting now
    const tsnow = Math.floor(Date.now() / 1000);
    await syncStateFile(chainId, tsnow, 0, [], network, emitter);
  }
  // print pwd for debugging
  emitter.emit(BotEvents.LOCK_DIRECTORY, process.cwd());
  const chain_state_raw = fileSystem.readFileSync(stateFile, { encoding: "utf8" });
  const chain_state = JSON.parse(chain_state_raw);
  let hashiBlockNumber = 0;
  if ("hashiBlockNumber" in chain_state) {
    hashiBlockNumber = chain_state["hashiBlockNumber"];
  }
  return hashiBlockNumber;
}

/**
 * Update the state file with the new nonce and release the lock.
 * If nonceFrom is null, the state file will not be updated.
 * @param chainId Chain ID of the relayer
 * @param createdTimestamp Timestamp when the relayer was started
 * @param hashiBlockNumberFrom The block number of the last processed Hashi message
 * @param hashiMessages The list of Hashi messages that are pending execution
 * @param network Network name of the relayer (e.g. "testnet")
 * @param emitter EventEmitter instance
 */
async function updateHashiStateFile(
  chainId: number,
  createdTimestamp: number,
  hashiBlockNumberFrom: number,
  hashiMessages: HashiMessageExecutionVars[],
  network: string,
  emitter: EventEmitter,
  fileSystem: typeof fs = fs,
  removeLock: typeof releaseLock = releaseLock
) {
  const stateDir = process.env.STATE_DIR || "";
  if (!fileSystem.existsSync(stateDir)) {
    fileSystem.mkdirSync(stateDir, { recursive: true });
  }
  const chain_state_file = process.env.STATE_DIR + network + "_" + chainId + ".json";
  const json = {
    ts: createdTimestamp,
    hashiBlockNumber: hashiBlockNumberFrom,
    hashiMessages: hashiMessages,
  };
  fileSystem.writeFileSync(chain_state_file, JSON.stringify(json, null, 2), { encoding: "utf8" });
  removeLock(network, chainId);
  emitter.emit(BotEvents.LOCK_RELEASED);
}

/**
 * Reads the pending Hashi messages from the state file.
 * Returns an empty array if the file doesn't exist or has no messages.
 * @param chainId Chain ID of the relayer
 * @param network Network name of the relayer (e.g. "testnet")
 * @param fileSystem File system module (injected for testing)
 * @returns Array of pending messages
 */
async function readPendingMessages(
  chainId: number,
  network: string,
  fileSystem: typeof fs = fs
): Promise<HashiMessageExecutionVars[]> {
  const stateDir = process.env.STATE_DIR || "";
  const stateFile = path.join(stateDir, `${network}_${chainId}.json`);

  if (!fileSystem.existsSync(stateFile)) {
    return [];
  }

  try {
    const chain_state_raw = fileSystem.readFileSync(stateFile, { encoding: "utf8" });
    const chain_state = JSON.parse(chain_state_raw);

    if ("hashiMessages" in chain_state && Array.isArray(chain_state.hashiMessages)) {
      return chain_state.hashiMessages;
    }

    return [];
  } catch (error) {
    console.error(`Failed to parse state file for ${network}_${chainId}:`, error);
    return [];
  }
}

export { getStartBlockNumber, updateHashiStateFile, readPendingMessages };
