require("dotenv").config();
import { relayBatch, RelayBatchDeps } from "utils/relay";
import { initialize, updateStateFile, delay, setupExitHandlers, ShutdownManager } from "utils/relayerHelpers";
import { getEpochPeriod } from "consts/bridgeRoutes";

export async function start(shutdownManager: ShutdownManager = new ShutdownManager()) {
  const network = "testnet";
  const chainId = parseInt(process.env.VEAOUTBOX_CHAIN_ID);
  const epochPeriod = getEpochPeriod(chainId);
  const maxBatchSize = 10; // 10 messages per batch

  await setupExitHandlers(chainId, shutdownManager, network);

  while (!shutdownManager.getIsShuttingDown()) {
    let nonce = await initialize(chainId, network);
    const relayBatchDeps: RelayBatchDeps = {
      chainId,
      nonce,
      maxBatchSize,
    };
    nonce = await relayBatch(relayBatchDeps);
    if (nonce != null) await updateStateFile(chainId, Math.floor(Date.now() / 1000), nonce, network);
    const currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 100 * 1000;
    console.log("waiting for the next epoch. . .", Math.floor(delayAmount / 1000), "seconds");
    await delay(delayAmount);
  }
}

if (require.main === module) {
  const shutdownManager = new ShutdownManager(false);
  start(shutdownManager);
}
