import { relayAllFrom } from "./utils/relay";
import * as fs from "fs";

// let chain_ids = [5, 10200];
let chain_ids = [11155111];
const epochPeriod = 1800; // 30 min
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
      let nonce = await initialize(chain_id);
      // This is libghtbulb switch address in arbitrum sepolia
      const sender = "0x28d6D503F4c5734cD926E96b63C61527d975B382";
      nonce = await relayAllFrom(chain_id, nonce, sender);
      if (nonce != null) await updateStateFile(chain_id, Math.floor(Date.now() / 1000), nonce);
    }
    const currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 100 * 1000;
    console.log("waiting for the next epoch. . .", Math.floor(delayAmount / 1000), "seconds");
    await delay(delayAmount);
  }
})();

async function initialize(chain_id: number): Promise<number> {
  if (chain_id !== 11155111) throw new Error("Invalid chainid");

  const lock_file_name = "./src/state/" + chain_id + ".pid";

  if (fs.existsSync(lock_file_name)) {
    console.log("Skipping chain with process already running, delete pid file to force", chain_id);
    throw new Error("Already running");
  }
  fs.writeFileSync(lock_file_name, process.pid.toString(), { encoding: "utf8" });

  // STATE_DIR is absolute path of the directory where the state files are stored
  // STATE_DIR must have trailing slash
  const state_file = process.env.STATE_DIR + chain_id + ".json";
  if (!fs.existsSync(state_file)) {
    // No state file so initialize starting now
    const tsnow = Math.floor(Date.now() / 1000);
    await updateStateFile(chain_id, tsnow, 0);
  }

  // print pwd for debugging
  console.log(process.cwd());
  var chain_state = require(state_file);

  let nonce = 0;
  if ("nonce" in chain_state) {
    nonce = chain_state["nonce"];
  }

  return nonce;
}

async function updateStateFile(chain_id: number, createdTimestamp: number, nonceFrom: number) {
  const chain_state_file = "./src/state/" + chain_id + ".json";
  const json = {
    ts: createdTimestamp,
    nonce: nonceFrom,
  };
  fs.writeFileSync(chain_state_file, JSON.stringify(json), { encoding: "utf8" });
  for (const chain_id of chain_ids) {
    const lock_file_name = "./src/state/" + chain_id + ".pid";
    if (fs.existsSync(lock_file_name)) {
      fs.unlinkSync(lock_file_name);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
