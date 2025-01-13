import * as fs from "fs";
import { claimLock, releaseLock } from "./lock";
import ShutdownManager from "./shutdownManager";

async function initialize(
  chainId: number,
  network: string,
  setLock: typeof claimLock = claimLock,
  syncStateFile: typeof updateStateFile = updateStateFile,
  fileSystem: typeof fs = fs
): Promise<number> {
  setLock(network, chainId);
  console.log("lock claimed");
  // STATE_DIR is absolute path of the directory where the state files are stored
  // STATE_DIR must have trailing slash
  const state_file = process.env.STATE_DIR + network + "_" + chainId + ".json";
  if (!fileSystem.existsSync(state_file)) {
    // No state file so initialize starting now
    const tsnow = Math.floor(Date.now() / 1000);
    await syncStateFile(chainId, tsnow, 0, network);
  }
  // print pwd for debugging
  console.log(process.cwd());

  const chain_state_raw = fileSystem.readFileSync(state_file, { encoding: "utf8" });
  const chain_state = JSON.parse(chain_state_raw);
  let nonce = 0;
  if ("nonce" in chain_state) {
    nonce = chain_state["nonce"];
  }

  return nonce;
}

async function updateStateFile(
  chainId: number,
  createdTimestamp: number,
  nonceFrom: number,
  network: string,
  fileSystem: typeof fs = fs,
  removeLock: typeof releaseLock = releaseLock
) {
  const chain_state_file = "./state/" + network + "_" + chainId + ".json";
  const json = {
    ts: createdTimestamp,
    nonce: nonceFrom,
  };
  fileSystem.writeFileSync(chain_state_file, JSON.stringify(json), { encoding: "utf8" });

  removeLock(network, chainId);
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
