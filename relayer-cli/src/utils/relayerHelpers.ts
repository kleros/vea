import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { claimLock, releaseLock } from "./lock";
import ShutdownManager from "./shutdownManager";
import { BotEvents } from "./botEvents";
import { NetworkConfigNotSet } from "./errors";
import { Network } from "../consts/bridgeRoutes";
require("dotenv").config();

/**
 * Initialize the relayer by claiming the lock and reading the nonce from the state file.
 * If the state file does not exist, it will be created with the current timestamp and nonce 0.
 *
 * @param chainId Chain ID of the relayer
 * @param network Network name of the relayer (e.g. "testnet")
 * @param emitter EventEmitter instance
 *
 * @returns The nonce read from the state file
 */
async function initialize(
  chainId: number,
  network: string,
  emitter: EventEmitter,
  setLock: typeof claimLock = claimLock,
  syncStateFile: typeof updateStateFile = updateStateFile,
  fileSystem: typeof fs = fs
): Promise<{ nonce: number }> {
  setLock(network, chainId);
  emitter.emit(BotEvents.LOCK_CLAIMED);
  // STATE_DIR is absolute path of the directory where the state files are stored
  // STATE_DIR must have trailing slash
  const stateDir = process.env.STATE_DIR || "";
  const stateFile = path.join(stateDir, `${network}_${chainId}.json`);
  if (!fileSystem.existsSync(stateFile)) {
    // No state file so initialize starting now
    const tsnow = Math.floor(Date.now() / 1000);
    await syncStateFile(chainId, tsnow, 0, network, emitter);
  }
  // print pwd for debugging
  emitter.emit(BotEvents.LOCK_DIRECTORY, process.cwd());

  const chain_state_raw = fileSystem.readFileSync(stateFile, { encoding: "utf8" });
  const chain_state = JSON.parse(chain_state_raw);
  let nonce = 0;
  if ("nonce" in chain_state) {
    nonce = chain_state["nonce"];
  }

  return { nonce };
}

/**
 * Update the state file with the new nonce and release the lock.
 * If nonceFrom is null, the state file will not be updated.
 * @param chainId Chain ID of the relayer
 * @param createdTimestamp Timestamp when the relayer was started
 * @param nonceFrom New nonce to be written to the state file
 * @param network Network name of the relayer (e.g. "testnet")
 * @param emitter EventEmitter instance
 */
async function updateStateFile(
  chainId: number,
  createdTimestamp: number,
  nonceFrom: number,
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
    nonce: nonceFrom,
  };
  fileSystem.writeFileSync(chain_state_file, JSON.stringify(json), { encoding: "utf8" });
  removeLock(network, chainId);
  emitter.emit(BotEvents.LOCK_RELEASED);
}

/**
 * Helper function to cleanup and delete the .pid lock file.
 *
 * @param emitter EventEmitter instance
 */
async function cleanupAllLockFiles(emitter: EventEmitter, fileSystem: typeof fs = fs): Promise<void> {
  const stateDir = process.env.STATE_DIR || "";
  if (!fileSystem.existsSync(stateDir)) return;

  const pidFiles = (await fileSystem.promises.readdir(stateDir)).filter((f) => f.endsWith(".pid"));
  await Promise.allSettled(
    pidFiles.map(async (f) => {
      const fullPath = path.join(stateDir, f);
      try {
        const pid = parseInt(await fileSystem.promises.readFile(fullPath, "utf8"), 10);
        if (pid === process.pid) {
          await fileSystem.promises.unlink(fullPath);
          emitter.emit(BotEvents.LOCK_RELEASED, `Lock file ${fullPath} deleted.`);
        }
      } catch (err) {
        emitter.emit(BotEvents.EXCEPTION, new Error(`Failed to clean up ${fullPath}: ${err}`));
      }
    })
  );
}

/**
 * Setup exit handlers for the process to gracefully shutdown the relayer
 * @param chainId Chain ID of the relayer
 * @param shutdownManager ShutdownManager instance
 * @param network Network name of the relayer (e.g. "testnet")
 * @param emitter EventEmitter instance
 */
async function setupExitHandlers(shutdownManager: ShutdownManager, emitter: EventEmitter) {
  const handleExit = async (exitCode: number = 0) => {
    shutdownManager.triggerShutdown();
    emitter.emit(BotEvents.EXIT);
    await cleanupAllLockFiles(emitter);
    process.exit(exitCode);
  };

  const addListenerOnce = (event: string, handler: (...args: any[]) => void) => {
    if (process.listenerCount(event) === 0) {
      process.on(event, handler);
    }
  };

  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
    if (process.listenerCount(signal) === 0) {
      process.on(signal, async () => {
        await handleExit(0);
      });
    }
  });

  addListenerOnce("exit", async () => {
    await handleExit();
  });

  addListenerOnce("uncaughtException", async (err: Error) => {
    emitter.emit(BotEvents.EXCEPTION, err);
    await handleExit(1);
  });

  addListenerOnce("unhandledRejection", async (reason: unknown, promise: Promise<unknown>) => {
    emitter.emit(BotEvents.PROMISE_REJECTION, reason, promise);
    await handleExit(1);
  });
}

type RelayerNetworkConfig = {
  chainId: number; // target chainId (VeaOutbox chain)
  network: Network;
  senders: string[];
  sourceChainId?: number; // source chainId (for hashi executor)
};

/**
 * Get the network configurations from the environment variables
 * @returns The network configurations
 */
function getNetworkConfig(): RelayerNetworkConfig[] {
  const chainIds = process.env.VEAOUTBOX_CHAINS ? process.env.VEAOUTBOX_CHAINS.split(",") : [];
  const hashiChains = process.env.HASHI_CHAINS ? process.env.HASHI_CHAINS.split(",") : [];
  const devnetSenders = process.env.SENDER_ADDRESSES_DEVNET ? process.env.SENDER_ADDRESSES_DEVNET.split(",") : [];
  const testnetSenders = process.env.SENDER_ADDRESSES_TESTNET ? process.env.SENDER_ADDRESSES_TESTNET.split(",") : [];
  const hashiSenders = process.env.SENDER_ADDRESSES_HASHI ? process.env.SENDER_ADDRESSES_HASHI.split(",") : [];
  const toRelayDevnet = devnetSenders.length > 0;
  const toRelayTestnet = testnetSenders.length > 0;
  const toRelayHashi = hashiSenders.length > 0;

  const relayerNetworkConfig: RelayerNetworkConfig[] = [];
  for (const chainId of chainIds) {
    if (toRelayDevnet) {
      relayerNetworkConfig.push({
        chainId: Number(chainId),
        network: Network.DEVNET,
        senders: devnetSenders,
      });
    }
    if (toRelayTestnet) {
      relayerNetworkConfig.push({
        chainId: Number(chainId),
        network: Network.TESTNET,
        senders: testnetSenders,
      });
    }
  }
  for (const chainPair of hashiChains) {
    const [sourceChainIdStr, targetChainIdStr] = chainPair.split("-");
    const sourceChainId = Number(sourceChainIdStr);
    const targetChainId = Number(targetChainIdStr);

    if (toRelayHashi) {
      relayerNetworkConfig.push({
        chainId: targetChainId,
        network: Network.TESTNET,
        senders: hashiSenders,
        sourceChainId: sourceChainId,
      });
    }
  }

  if (relayerNetworkConfig.length === 0) throw new NetworkConfigNotSet();
  return relayerNetworkConfig;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export {
  getNetworkConfig,
  initialize,
  updateStateFile,
  cleanupAllLockFiles,
  setupExitHandlers,
  delay,
  ShutdownManager,
  RelayerNetworkConfig,
};
