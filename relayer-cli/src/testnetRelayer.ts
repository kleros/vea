require("dotenv").config();
import { EventEmitter } from "node:events";
import { relayBatch, RelayBatchDeps } from "utils/relay";
import {
  initialize as initializeNonce,
  updateStateFile,
  delay,
  setupExitHandlers,
  ShutdownManager,
} from "utils/relayerHelpers";
import { getEpochPeriod } from "consts/bridgeRoutes";
import { initialize as initializeEmitter } from "utils/logger";
import { BotEvents } from "utils/botEvents";

interface RelayerConfig {
  chainId: number;
  network: string;
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
export async function start({ chainId, network, shutdownManager, emitter }: RelayerConfig) {
  initializeEmitter(emitter);
  emitter.emit(BotEvents.STARTED, chainId, network);
  const epochPeriod = getEpochPeriod(chainId);
  const maxBatchSize = 10; // 10 messages per batch

  await setupExitHandlers(chainId, shutdownManager, network, emitter);

  while (!shutdownManager.getIsShuttingDown()) {
    let nonce = await initializeNonce(chainId, network, emitter);
    const relayBatchDeps: RelayBatchDeps = {
      chainId,
      nonce,
      maxBatchSize,
    };
    nonce = await relayBatch(relayBatchDeps);
    if (nonce != null) await updateStateFile(chainId, Math.floor(Date.now() / 1000), nonce, network, emitter);
    const currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 100 * 1000;
    emitter.emit(BotEvents.WAITING, delayAmount);
    await delay(delayAmount);
  }
}

if (require.main === module) {
  const emitter = new EventEmitter();
  const shutdownManager = new ShutdownManager(false);
  const testnetRelayerConfig: RelayerConfig = {
    shutdownManager,
    emitter,
    chainId: Number(process.env.VEAOUTBOX_CHAIN_ID),
    network: "testnet",
  };

  start(testnetRelayerConfig);
}
