require("dotenv").config();
import { EventEmitter } from "node:events";
import { ethers } from "ethers";
import { relayBatch, relayAllFrom } from "./utils/relay";
import {
  initialize as initializeNonces,
  updateStateFile,
  delay,
  setupExitHandlers,
  ShutdownManager,
  getNetworkConfig,
  RelayerNetworkConfig,
} from "./utils/relayerHelpers";
import { initialize as initializeEmitter } from "./utils/logger";
import { BotEvents } from "./utils/botEvents";
import { getEpochPeriod, Network } from "./consts/bridgeRoutes";
import { runHashiExecutor } from "./utils/hashi";
import { sendHeartbeat } from "./utils/heartbeat";

interface RelayerConfig {
  networkConfigs: RelayerNetworkConfig[];
  shutdownManager: ShutdownManager;
  emitter: EventEmitter;
}

const HASHI_CYCLE_TIME_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start the relayer
 * @param config.networkConfigs The network configurations retrieved from the env.
 * @param config.shutdownManager The shutdown manager
 * @param config.emitter The event emitter
 */
export async function start({ networkConfigs, shutdownManager, emitter }: RelayerConfig) {
  const HEARTBEAT_URL = process.env.HEARTBEAT_URL;
  await sendHeartbeat("started", HEARTBEAT_URL!);
  initializeEmitter(emitter);
  const executeTimes: number[] = networkConfigs.map(() => 0);
  await setupExitHandlers(shutdownManager, emitter);
  while (!shutdownManager.getIsShuttingDown()) {
    let executeTime: number = HASHI_CYCLE_TIME_MS + Date.now();
    await sendHeartbeat("running", HEARTBEAT_URL!);
    for (let i = 0; i < networkConfigs.length; i++) {
      if (executeTimes[i] > Date.now()) {
        continue;
      }
      executeTimes[i] = await processNetworkConfig(networkConfigs[i], emitter);
      executeTime = Math.min(executeTime, executeTimes[i]);
    }
    const delayMs = executeTime - Date.now();
    emitter.emit(BotEvents.WAITING, delayMs);
    await delay(delayMs);
  }
  await sendHeartbeat("stopped", HEARTBEAT_URL!);
}

/**
 * Process the network configuration
 * @param networkConfig The network configuration
 * @param shutdownManager The shutdown manager
 * @param emitter The event emitter
 * @param currentDelay The current delay
 * @returns The new delay
 */
async function processNetworkConfig(networkConfig: RelayerNetworkConfig, emitter: EventEmitter): Promise<number> {
  const { chainId, network, senders, sourceChainId } = networkConfig;
  const logNetwork = sourceChainId ? `${sourceChainId}->${chainId} Hashi` : network;
  emitter.emit(BotEvents.STARTED, chainId, logNetwork);
  const maxBatchSize = 10; // 10 messages per batch
  try {
    if (sourceChainId) {
      await runHashiExecutor({
        sourceChainId,
        targetChainId: chainId,
        network,
        emitter,
      });
      return Date.now() + HASHI_CYCLE_TIME_MS;
    }

    let { nonce } = await initializeNonces(chainId, network, emitter);
    const toRelayAll = senders[0] === ethers.ZeroAddress;
    nonce = toRelayAll
      ? await relayBatch({ chainId, network, nonce, maxBatchSize, emitter })
      : await relayAllFrom(chainId, network, nonce, senders, emitter);

    await updateStateFile(chainId, Math.floor(Date.now() / 1000), nonce, network, emitter);

    if (network === Network.DEVNET) {
      return Date.now() + 1000 * 60 * 2; // 2 min for devnet
    } else {
      const currentTS = Math.floor(Date.now() / 1000);
      const epochPeriod = getEpochPeriod(chainId);
      const timeLeft = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 100 * 1000;
      return Date.now() + timeLeft;
    }
  } catch (e) {
    emitter.emit(BotEvents.ERROR_CONTEXT, chainId, network);
    throw e;
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
