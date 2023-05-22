import { relayAllFrom } from "./utils/relay";
import * as fs from "fs";
require("dotenv").config();

let chain_ids = [5, 10200];
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
      let nonce = initialize(chain_id);
      const senderGateway =
        chain_id === 10200
          ? "0xe6aC8CfF97199A67b8121a3Ce3aC98772f90B94b"
          : "0x177AfBF3cda970024Efa901516735aF9c3B894a4";
      nonce = await relayAllFrom(chain_id, nonce, senderGateway);
      updateStateFile(chain_id, Math.floor(Date.now() / 1000), nonce);
    }
    const currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 300 * 1000;
    console.log("waiting for the next epoch. . .", Math.floor(delayAmount / 1000), "seconds");
    await delay(delayAmount);
  }
})();

function initialize(chain_id: number): number {
  if (chain_id !== 5 && chain_id !== 10200) throw new Error("Invalid chainid");

  const lock_file_name = "./src/state/" + chain_id + ".pid";

  if (fs.existsSync(lock_file_name)) {
    console.log("Skipping chain with process already running, delete pid file to force", chain_id);
    throw new Error("Already running");
  }
  fs.writeFileSync(lock_file_name, process.pid.toString(), { encoding: "utf8" });

  const state_file_name = "./state/" + chain_id + ".json";
  if (!fs.existsSync(state_file_name)) {
    // No state file so initialize starting now
    const tsnow = Math.floor(Date.now() / 1000);
    updateStateFile(chain_id, tsnow, 0);
  }

  // print pwd for debugging
  console.log(process.cwd());
  var chain_state = require(state_file_name);

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
