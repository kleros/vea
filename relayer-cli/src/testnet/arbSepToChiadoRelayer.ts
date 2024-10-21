import * as fs from "fs";
require("dotenv").config();
import { relayBatch } from "utils/relay";
import { initialize, updateStateFile } from "utils/relayerHelpers";
const _contract = require("@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisTestnet.json");

let chain_id = 10200;
const epochPeriod = 7200; // 3 hrs
const batchSize = 10; // 10 messages per batch
const network = "testnet";

["SIGINT", "SIGTERM", "SIGQUIT", "EXIT", "MODULE_NOT_FOUND"].forEach((signal) =>
  process.on(signal, async () => {
    console.log("exit");
    const lock_file_name = "./src/state/" + chain_id + ".pid";
    if (fs.existsSync(lock_file_name)) {
      fs.unlinkSync(lock_file_name);
    }
    process.exit(0);
  })
);

(async () => {
  while (1) {
    let nonce = await initialize(chain_id, network);
    console.log("chain_id", chain_id, "nonce", nonce);
    nonce = await relayBatch(chain_id, nonce, batchSize, _contract);
    if (nonce != null) await updateStateFile(chain_id, Math.floor(Date.now() / 1000), nonce, network);

    const currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 100 * 1000;
    console.log("waiting for the next epoch. . .", Math.floor(delayAmount / 1000), "seconds");
    await delay(delayAmount);
  }
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
