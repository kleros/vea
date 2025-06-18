require("dotenv").config();
import { EventEmitter } from "node:events";
import { ethers } from "ethers";
import https from "https";
import { relayBatch, relayAllFrom } from "./utils/relay";
import {
  initialize as initializeNonce,
  updateStateFile,
  delay,
  setupExitHandlers,
  ShutdownManager,
  getNetworkConfig,
  RelayerNetworkConfig,
} from "./utils/relayerHelpers";
import { initialize as initializeEmitter, logger } from "./utils/logger";
import { BotEvents } from "./utils/botEvents";
import { getEpochPeriod, Network } from "./consts/bridgeRoutes";

interface RelayerConfig {
  networkConfigs: RelayerNetworkConfig[];
  shutdownManager: ShutdownManager;
  emitter: EventEmitter;
}

/**
 * Sends a heartbeat signal to the monitoring service
 */
const sendHeartbeat = async (): Promise<void> => {
  const HEARTBEAT_URL = process.env.HEARTBEAT_URL;
  if (!HEARTBEAT_URL) {
    return;
  }
  try {
    const url = new URL(HEARTBEAT_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "GET",
      headers: {
        "User-Agent": "Vea-Validator-CLI/1.0",
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve();
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error("Heartbeat request timeout"));
      });

      req.end();
    });
  } catch (error) {
    // Silently fail - heartbeat errors shouldn't affect the main relayer operation
  }
};

/**
 * Start the relayer
 * @param config.networkConfigs The network configurations retrieved from the env.
 * @param config.shutdownManager The shutdown manager
 * @param config.emitter The event emitter
 */
export async function start({ networkConfigs, shutdownManager, emitter }: RelayerConfig) {
  initializeEmitter(emitter);

  // Send startup heartbeat
  await sendHeartbeat();

  let delayAmount = 7200 * 1000; // 2 hours in ms
  while (!shutdownManager.getIsShuttingDown()) {
    for (const networkConfig of networkConfigs) {
      delayAmount = await processNetworkConfig(networkConfig, shutdownManager, emitter, delayAmount);
    }
    emitter.emit(BotEvents.WAITING, delayAmount);

    // Send heartbeat before waiting
    await sendHeartbeat();

    await delay(delayAmount);
  }

  // Send shutdown heartbeat
  await sendHeartbeat();
}

/**
 * Process the network configuration
 * @param networkConfig The network configuration
 * @param shutdownManager The shutdown manager
 * @param emitter The event emitter
 * @param currentDelay The current delay
 * @returns The new delay
 */
async function processNetworkConfig(
  networkConfig: RelayerNetworkConfig,
  shutdownManager: ShutdownManager,
  emitter: EventEmitter,
  currentDelay: number
): Promise<number> {
  const { chainId, network, senders } = networkConfig;
  emitter.emit(BotEvents.STARTED, chainId, network);
  const maxBatchSize = 10; // 10 messages per batch

  await setupExitHandlers(chainId, shutdownManager, network, emitter);

  let nonce = await initializeNonce(chainId, network, emitter);
  if (nonce == null) return currentDelay;

  const toRelayAll = senders[0] === ethers.ZeroAddress;
  nonce = toRelayAll
    ? await relayBatch({ chainId, network, nonce, maxBatchSize, emitter })
    : await relayAllFrom(chainId, network, nonce, senders, emitter);

  if (nonce == null) return currentDelay;

  await updateStateFile(chainId, Math.floor(Date.now() / 1000), nonce, network, emitter);

  if (network === Network.DEVNET) {
    return 1000 * 10; // 10 seconds for devnet
  } else {
    const currentTS = Math.floor(Date.now() / 1000);
    const epochPeriod = getEpochPeriod(chainId);
    const timeLeft = (epochPeriod - (Math.floor(currentTS / 1000) % epochPeriod)) * 1000 + 100 * 1000;
    return Math.min(currentDelay, timeLeft);
  }
}

if (require.main === module) {
  const emitter = new EventEmitter();
  const shutdownManager = new ShutdownManager(false);
  const networkConfigs = getNetworkConfig();
  const testnetRelayerConfig: RelayerConfig = {
    networkConfigs,
    shutdownManager,
    emitter,
  };

  start(testnetRelayerConfig);
}
