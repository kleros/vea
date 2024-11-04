import * as fs from "fs";
require("dotenv").config();
import { relayBatch } from "utils/relay";
import { initialize, updateStateFile, delay } from "utils/relayerHelpers";
const _contract = require("@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisTestnet.json");

const chainId = 10200;
const epochPeriod = 7200; // 3 hrs
const batchSize = 10; // 10 messages per batch
const network = "testnet";

["SIGINT", "SIGTERM", "SIGQUIT", "EXIT", "MODULE_NOT_FOUND"].forEach((signal) =>
  process.on(signal, async () => {
    console.log("exit");
    const lock_file_name = "./src/state/" + chainId + ".pid";
    if (fs.existsSync(lock_file_name)) {
      fs.unlinkSync(lock_file_name);
    }
    process.exit(0);
  })
);

(async () => {
  while (true) {
    let nonce = await initialize(chainId, network);
    console.log("chain_id", chainId, "nonce", nonce);
    nonce = await relayBatch(chainId, nonce, batchSize, _contract);
    if (nonce != null) await updateStateFile(chainId, Math.floor(Date.now() / 1000), nonce, network);
    const currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 100 * 1000;
    console.log("waiting for the next epoch. . .", Math.floor(delayAmount / 1000), "seconds");
    await delay(delayAmount);
  }
})();
