import { relayAllFrom } from "./utils/relay";
import { initialize, ShutdownManager, updateStateFile, setupExitHandlers, delay } from "./utils/relayerHelpers";

export async function start(shutdownManager: ShutdownManager = new ShutdownManager()) {
  const chainId = parseInt(process.env.VEAOUTBOX_CHAIN_ID);
  const epochPeriod = 1800; // 30 min
  const network = "devnet";
  await setupExitHandlers(chainId, shutdownManager, network);
  while (!shutdownManager.getIsShuttingDown()) {
    let nonce = await initialize(chainId, network);
    // This is libghtbulb switch address in arbitrum sepolia
    const sender = process.env.DEVNET_SENDER;
    nonce = await relayAllFrom(chainId, nonce, sender);
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
