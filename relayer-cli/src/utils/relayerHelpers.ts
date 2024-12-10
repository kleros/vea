import * as fs from "fs";
import ShutdownManager from "./shutdownManager";

async function initialize(chainId: number, network: string): Promise<number> {
  const lockFileName = "./state/" + network + "_" + chainId + ".pid";

  if (fs.existsSync(lockFileName)) {
    console.log("Skipping chain with process already running, delete pid file to force", chainId);
    throw new Error("Already running");
  }
  fs.writeFileSync(lockFileName, process.pid.toString(), { encoding: "utf8" });

  // STATE_DIR is absolute path of the directory where the state files are stored
  // STATE_DIR must have trailing slash
  const state_file = process.env.STATE_DIR + network + "_" + chainId + ".json";
  if (!fs.existsSync(state_file)) {
    // No state file so initialize starting now
    const tsnow = Math.floor(Date.now() / 1000);
    await updateStateFile(chainId, tsnow, 0, network);
  }

  // print pwd for debugging
  console.log(process.cwd());
  const chain_state_raw = fs.readFileSync(state_file, { encoding: "utf8" });
  const chain_state = JSON.parse(chain_state_raw);
  let nonce = 0;
  if ("nonce" in chain_state) {
    nonce = chain_state["nonce"];
  }

  return nonce;
}

async function updateStateFile(chainId: number, createdTimestamp: number, nonceFrom: number, network: string) {
  const chain_state_file = "./state/" + network + "_" + chainId + ".json";
  const json = {
    ts: createdTimestamp,
    nonce: nonceFrom,
  };
  fs.writeFileSync(chain_state_file, JSON.stringify(json), { encoding: "utf8" });

  const lockFileName = "./state/" + network + "_" + chainId + ".pid";
  if (fs.existsSync(lockFileName)) {
    fs.unlinkSync(lockFileName);
  }
}

async function setupExitHandlers(chainId: number, shutdownManager: ShutdownManager, network: string) {
  const cleanup = async () => {
    console.log("exit");
    const lockFileName = "./state/" + network + "_" + chainId + ".pid";
    if (fs.existsSync(lockFileName)) {
      await fs.promises.unlink(lockFileName);
    }
  };
  const handleExit = async (exitCode: number = 0) => {
    shutdownManager.triggerShutdown();
    await cleanup();
    process.exit(0);
  };

  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) =>
    process.on(signal, async () => {
      await handleExit(0);
      process.exit(0);
    })
  );

  process.on("exit", async () => {
    await handleExit();
  });

  process.on("uncaughtException", async (err) => {
    console.error("Uncaught exception:", err);
    await handleExit(1);
  });

  process.on("unhandledRejection", async (reason, promise) => {
    console.error("Unhandled promise rejection:", reason, "at", promise);
    await handleExit(1);
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { initialize, updateStateFile, setupExitHandlers, delay, ShutdownManager };
