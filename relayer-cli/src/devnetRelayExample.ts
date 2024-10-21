import { relayAllFrom } from "./utils/relay";
import * as fs from "fs";
import { initialize, updateStateFile } from "./utils/relayerHelpers";

// let chain_ids = [5, 10200];
let chain_ids = [11155111];
const epochPeriod = 1800; // 30 min
const _contract = require("@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json");
const network = "devnet";

["SIGINT", "SIGTERM", "SIGQUIT", "EXIT", "MODULE_NOT_FOUND"].forEach((signal) =>
  process.on(signal, async () => {
    console.log("exit");
    for (const chain_id of chain_ids) {
      const lock_file_name = "./src/state/" + chain_id + ".pid";
      if (fs.existsSync(lock_file_name)) {
        fs.unlinkSync(lock_file_name);
      }
    }
    process.exit(0);
  })
);

(async () => {
  while (1) {
    for (const chain_id of chain_ids) {
      let nonce = await initialize(chain_id, network);
      // This is libghtbulb switch address in arbitrum sepolia
      const sender = "0x28d6D503F4c5734cD926E96b63C61527d975B382";
      nonce = await relayAllFrom(chain_id, nonce, sender, _contract);
      if (nonce != null) await updateStateFile(chain_id, Math.floor(Date.now() / 1000), nonce, network);
    }
    const currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 100 * 1000;
    console.log("waiting for the next epoch. . .", Math.floor(delayAmount / 1000), "seconds");
    await delay(delayAmount);
  }
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
