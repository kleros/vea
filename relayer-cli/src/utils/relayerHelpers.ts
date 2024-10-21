import * as fs from "fs";

async function initialize(chain_id: number, network: string): Promise<number> {
  const lock_file_name = "./src/state/" + network + "_" + chain_id + ".pid";

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
    await updateStateFile(chain_id, tsnow, 0, network);
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

async function updateStateFile(chain_id: number, createdTimestamp: number, nonceFrom: number, network: string) {
  const chain_state_file = "./src/state/" + network + "_" + chain_id + ".json";
  const json = {
    ts: createdTimestamp,
    nonce: nonceFrom,
  };
  fs.writeFileSync(chain_state_file, JSON.stringify(json), { encoding: "utf8" });

  const lock_file_name = "./src/state/testnet_" + chain_id + ".pid";
  if (fs.existsSync(lock_file_name)) {
    fs.unlinkSync(lock_file_name);
  }
}

export { initialize, updateStateFile };
