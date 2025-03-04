require("dotenv").config();
import { EventEmitter } from "node:events";
import { ethers } from "ethers";
import { relayBatch, relayAllFrom, RelayBatchDeps } from "utils/relay";
import {
  initialize as initializeNonce,
  updateStateFile,
  delay,
  setupExitHandlers,
  ShutdownManager,
  getNetworkConfig,
  RelayerNetworkConfig,
} from "utils/relayerHelpers";
import { getEpochPeriod } from "consts/bridgeRoutes";
import { initialize as initializeEmitter } from "utils/logger";
import { BotEvents } from "utils/botEvents";

interface RelayerConfig {
  networkConfigs: RelayerNetworkConfig[];
  shutdownManager: ShutdownManager;
  emitter: EventEmitter;
}

/**
 * Start the relayer
 * @param config.chainId The chain id of the veaOutbox chain
 * @param config.network The network of the veaOutbox chain
 * @param config.shutdownManager The shutdown manager
 * @param config.emitter The event emitter
 */
export async function start({ networkConfigs, shutdownManager, emitter }: RelayerConfig) {
  initializeEmitter(emitter);
  let delayAmount = 7200; // 2 hours, max epoch period
  while (!shutdownManager.getIsShuttingDown()) {
    for (const networkConfig of networkConfigs) {
      const { chainId, network, senders } = networkConfig;
      emitter.emit(BotEvents.STARTED, chainId, network);
      const epochPeriod = getEpochPeriod(chainId);
      const maxBatchSize = 10; // 10 messages per batch

      await setupExitHandlers(chainId, shutdownManager, network, emitter);

      let nonce = await initializeNonce(chainId, network, emitter);

      const toRelayAll = senders[0] == ethers.ZeroAddress;
      if (toRelayAll) {
        nonce = await relayBatch({
          chainId,
          network,
          nonce,
          maxBatchSize,
        });
      } else {
        nonce = await relayAllFrom(chainId, network, nonce, senders);
      }

      await updateStateFile(chainId, Math.floor(Date.now() / 1000), nonce, network, emitter);
      const currentTS = Math.floor(Date.now() / 1000);
      const timeLeft = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 100 * 1000;
      delayAmount = Math.min(delayAmount, timeLeft);
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
