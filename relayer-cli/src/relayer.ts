require("dotenv").config();
import { EventEmitter } from "node:events";
import { ethers } from "ethers";
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
import { initialize as initializeEmitter } from "./utils/logger";
import { BotEvents } from "./utils/botEvents";
import { getEpochPeriod, Network } from "./consts/bridgeRoutes";

interface RelayerConfig {
  networkConfigs: RelayerNetworkConfig[];
  shutdownManager: ShutdownManager;
  emitter: EventEmitter;
}

/**
 * Start the relayer
 * @param config.networkConfigs The network configurations retrieved from the env.
 * @param config.shutdownManager The shutdown manager
 * @param config.emitter The event emitter
 */
export async function start({ networkConfigs, shutdownManager, emitter }: RelayerConfig) {
  initializeEmitter(emitter);
  let delayAmount = 7200 * 1000; // 2 hours in ms
  while (!shutdownManager.getIsShuttingDown()) {
    for (const networkConfig of networkConfigs) {
      const { chainId, network, senders } = networkConfig;
      emitter.emit(BotEvents.STARTED, chainId, network);
      const maxBatchSize = 10; // 10 messages per batch

      await setupExitHandlers(chainId, shutdownManager, network, emitter);

      let nonce = await initializeNonce(chainId, network, emitter);
      const toRelayAll = senders[0] == ethers.ZeroAddress;
      if (nonce == null) continue;
      if (toRelayAll) {
        nonce = await relayBatch({
          chainId,
          network,
          nonce,
          maxBatchSize,
          emitter,
        });
      } else {
        nonce = await relayAllFrom(chainId, network, nonce, senders, emitter);
      }
      if (nonce == null) continue;
      await updateStateFile(chainId, Math.floor(Date.now() / 1000), nonce, network, emitter);
      if (network == Network.DEVNET)
        delayAmount = 1000 * 10; // 10 seconds because devnet is not dependent on epoch period
      else {
        const currentTS = Math.floor(Date.now() / 1000);
        const epochPeriod = getEpochPeriod(chainId);
        const timeLeft = (epochPeriod - (Math.floor(currentTS / 1000) % epochPeriod)) * 1000 + 100 * 1000;
        delayAmount = Math.min(delayAmount, timeLeft);
      }
    }

    emitter.emit(BotEvents.WAITING, delayAmount);
    await delay(delayAmount);
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
