import * as fs from "fs";
import { EventEmitter } from "events";
import { claimLock, releaseLock } from "./lock";
import ShutdownManager from "./shutdownManager";
import { BotEvents } from "./botEvents";

/**
 * Initialize the relayer by claiming the lock and reading the nonce from the state file.
 * If the state file does not exist, it will be created with the current timestamp and nonce 0.
 *
 * @param chainId Chain ID of the relayer
 * @param network Network name of the relayer (e.g. "testnet")
 */
async function initialize(
  chainId: number,
  network: string,
  emitter: EventEmitter,
  setLock: typeof claimLock = claimLock,
  syncStateFile: typeof updateStateFile = updateStateFile,
  fileSystem: typeof fs = fs
): Promise<number> {
  setLock(network, chainId);
  emitter.emit(BotEvents.LOCK_CLAIMED);
  // STATE_DIR is absolute path of the directory where the state files are stored
  // STATE_DIR must have trailing slash
  const state_file = process.env.STATE_DIR + network + "_" + chainId + ".json";
  if (!fileSystem.existsSync(state_file)) {
    // No state file so initialize starting now
    const tsnow = Math.floor(Date.now() / 1000);
    await syncStateFile(chainId, tsnow, 0, network, emitter);
  }
  // print pwd for debugging
  emitter.emit(BotEvents.LOCK_DIRECTORY, process.cwd());

  const chain_state_raw = fileSystem.readFileSync(state_file, { encoding: "utf8" });
  const chain_state = JSON.parse(chain_state_raw);
  let nonce = 0;
  if ("nonce" in chain_state) {
    nonce = chain_state["nonce"];
  }

  return nonce;
}

async function updateStateFile(
  chainId: number,
  createdTimestamp: number,
  nonceFrom: number,
  network: string,
  emitter: EventEmitter,
  fileSystem: typeof fs = fs,
  removeLock: typeof releaseLock = releaseLock
) {
  const chain_state_file = "./state/" + network + "_" + chainId + ".json";
  const json = {
    ts: createdTimestamp,
    nonce: nonceFrom,
  };
  fileSystem.writeFileSync(chain_state_file, JSON.stringify(json), { encoding: "utf8" });

  removeLock(network, chainId);
  emitter.emit(BotEvents.LOCK_RELEASED);
}

async function setupExitHandlers(
  chainId: number,
  shutdownManager: ShutdownManager,
  network: string,
  emitter: EventEmitter
) {
  const cleanup = async () => {
    emitter.emit(BotEvents.EXIT);
    const lockFileName = "./state/" + network + "_" + chainId + ".pid";
    if (fs.existsSync(lockFileName)) {
      await fs.promises.unlink(lockFileName);
    }
  };
  const handleExit = async (exitCode: number = 0) => {
    shutdownManager.triggerShutdown();
    await cleanup();
    process.exit(0);
  };

  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) =>
    process.on(signal, async () => {
      await handleExit(0);
    })
  );

  process.on("exit", async () => {
    await handleExit();
  });

  process.on("uncaughtException", async (err) => {
    emitter.emit(BotEvents.EXCEPTION, err);
    await handleExit(1);
  });

  process.on("unhandledRejection", async (reason, promise) => {
    emitter.emit(BotEvents.PROMISE_REJECTION, reason, promise);
    await handleExit(1);
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { initialize, updateStateFile, setupExitHandlers, delay, ShutdownManager };
