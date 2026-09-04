import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { claimLock, releaseLock } from "../lock";
import { BotEvents } from "../botEvents";
import { HashiMessageExecutionVars } from "./hashiTypes";
require("dotenv").config();

/**
 * Get the block number to start relaying from by claiming the lock and reading the blockNumber from the state file.
 * If the state file does not exist, it will be created with the current timestamp and blockNumber 0.
 *
 * @param sourceChainId The numerical identifier of the source chain
 * @param targetChainId The numerical identifier of the destination chain
 * @param network Network name of the relayer (e.g. "testnet")
 * @param emitter EventEmitter instance
 *
 * @returns The nonce read from the state file
 */
async function getStartBlockNumber(
  sourceChainId: number,
  targetChainId: number,
  network: string,
  emitter: EventEmitter,
  setLock: typeof claimLock = claimLock,
  syncStateFile: typeof updateHashiStateFile = updateHashiStateFile,
  fileSystem: typeof fs = fs
): Promise<number> {
  setLock(network, sourceChainId, targetChainId);
  emitter.emit(BotEvents.LOCK_CLAIMED);
  // STATE_DIR is absolute path of the directory where the state files are stored
  // STATE_DIR must have trailing slash
  const stateDir = process.env.STATE_DIR || "";
  const stateFile = path.join(stateDir, `${network}_${sourceChainId}_${targetChainId}.json`);
  if (!fileSystem.existsSync(stateFile)) {
    // No state file so initialize starting now
    const tsnow = Math.floor(Date.now() / 1000);
    await syncStateFile(sourceChainId, targetChainId, tsnow, 0, [], network, emitter, true);
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
 * @param sourceChainId The numerical identifier of the source chain
 * @param targetChainId The numerical identifier of the destination chain
 * @param createdTimestamp Timestamp when the relayer was started
 * @param hashiBlockNumberFrom The block number of the last processed Hashi message
 * @param hashiMessages The list of Hashi messages that are pending execution
 * @param network Network name of the relayer (e.g. "testnet")
 * @param emitter EventEmitter instance
 */
async function updateHashiStateFile(
  sourceChainId: number,
  targetChainId: number,
  createdTimestamp: number,
  hashiBlockNumberFrom: number,
  hashiMessages: HashiMessageExecutionVars[],
  network: string,
  emitter: EventEmitter,
  isIniting = false,
  fileSystem: typeof fs = fs,
  removeLock: typeof releaseLock = releaseLock
) {
  const stateDir = process.env.STATE_DIR || "";
  if (!fileSystem.existsSync(stateDir)) {
    fileSystem.mkdirSync(stateDir, { recursive: true });
  }
  const chain_state_file = process.env.STATE_DIR + network + "_" + sourceChainId + "_" + targetChainId + ".json";
  const json = {
    ts: createdTimestamp,
    hashiBlockNumber: hashiBlockNumberFrom,
    hashiMessages: hashiMessages,
  };
  fileSystem.writeFileSync(chain_state_file, JSON.stringify(json, bigIntReplacer, 2), { encoding: "utf8" });
  if (!isIniting) {
    removeLock(network, sourceChainId, targetChainId);
  }
  emitter.emit(BotEvents.LOCK_RELEASED);
}

/**
 * Reads the pending Hashi messages from the state file.
 * Returns an empty array if the file doesn't exist or has no messages.
 * @param sourceChainId The numerical identifier of the source chain
 * @param targetChainId The numerical identifier of the destination chain
 * @param network Network name of the relayer (e.g. "testnet")
 * @param fileSystem File system module (injected for testing)
 * @returns Array of pending messages
 */
async function readPendingMessages(
  sourceChainId: number,
  targetChainId: number,
  network: string,
  fileSystem: typeof fs = fs
): Promise<HashiMessageExecutionVars[]> {
  const stateDir = process.env.STATE_DIR || "";
  const stateFile = path.join(stateDir, `${network}_${sourceChainId}_${targetChainId}.json`);

  if (!fileSystem.existsSync(stateFile)) {
    return [];
  }

  try {
    const chain_state_raw = fileSystem.readFileSync(stateFile, { encoding: "utf8" });
    const chain_state = JSON.parse(chain_state_raw, bigIntReviver);

    if ("hashiMessages" in chain_state && Array.isArray(chain_state.hashiMessages)) {
      return chain_state.hashiMessages;
    }

    return [];
  } catch (error) {
    console.error(`Failed to parse state file for ${network}_${sourceChainId}_${targetChainId}:`, error);
    return [];
  }
}

const bigIntReplacer = (_key: string, value: unknown) => (typeof value === "bigint" ? `${value}n` : value);
const bigIntReviver = (_key: string, value: unknown) =>
  typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value;

export { getStartBlockNumber, updateHashiStateFile, readPendingMessages };
