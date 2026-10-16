import fs from "fs";
import { dirname, join } from "path";
import { EventEmitter } from "events";
import { BotEvents } from "./botEvents";

/**
 * Returns the lock file path for a given network and chain id
 *
 * @param network - The network name
 * @param sourceChainId - The numerical identifier of the source chain
 * @param targetChainId - The numerical identifier of the destination chain
 * @returns The lock file path
 *
 * @example
 * getLockFilePath('goerli', 1, 2); // './state/goerli_1_2.pid'
 */
export function getLockFilePath(network: string, sourceChainId: number, targetChainId: number) {
  return `./state/${network.toLowerCase()}_${sourceChainId}_${targetChainId}.pid`;
}

export class LockfileExistsError extends Error {
  constructor(path: string) {
    super();
    this.message = `The application tried to claim the lockfile ${path} but it already exists. Please ensure no other instance is running and delete the lockfile before starting a new one.`;
    this.name = "OnlyOneProcessError";
  }
}

type ClaimLockDependencies = {
  fileExistsFn?: typeof fs.existsSync;
  writeFileFn?: typeof fs.writeFileSync;
};

/**
 * Ensures there is only one process running at the same time for a given lock file.
 *
 * If the lock file exists, thrown an error. If it does not exists, creates it with the current process id.
 *
 * @param network - The network name
 * @param sourceChainId - The numerical identifier of the source chain
 * @param targetChainId - The numerical identifier of the destination chain
 * @param dependencies - FS methods to be used
 *
 * @example
 * claimLock('/opt/app/lock.pid');
 */
export function claimLock(
  network: string,
  sourceChainId: number,
  targetChainId: number,
  dependencies: ClaimLockDependencies = {
    fileExistsFn: fs.existsSync,
    writeFileFn: fs.writeFileSync,
  }
) {
  const path = getLockFilePath(network, sourceChainId, targetChainId);
  const { fileExistsFn, writeFileFn } = dependencies;

  if (fileExistsFn(path)) throw new LockfileExistsError(path);
  writeFileFn(path, process.pid.toString(), { encoding: "utf8" });
}

type ReleaseLockDependencies = {
  fileExistsFn?: typeof fs.existsSync;
  unlinkFileFn?: typeof fs.unlinkSync;
};

/**
 * Ensures the lock file is removed
 *
 * @param network - The network name
 * @param sourceChainId - The numerical identifier of the source chain
 * @param targetChainId - The numerical identifier of the destination chain
 * @param dependencies - FS methods to be used
 *
 * @example
 * releaseLock('/opt/app/lock.pid');
 */
export function releaseLock(
  network: string,
  sourceChainId: number,
  targetChainId: number,
  dependencies: ReleaseLockDependencies = {
    fileExistsFn: fs.existsSync,
    unlinkFileFn: fs.unlinkSync,
  }
) {
  const { fileExistsFn, unlinkFileFn } = dependencies;
  const path = getLockFilePath(network, sourceChainId, targetChainId);

  if (!fileExistsFn(path)) return;
  unlinkFileFn(path);
}

// process.kill only takes 32-bit integers; a lock holding anything outside 1..MAX_PID was not written by claimLock
const MAX_PID = 2 ** 31 - 1;

/**
 * Tells whether a process is alive by sending it signal 0, which checks the pid without signalling the process.
 *
 * @param pid - A positive process id
 * @param kill - process.kill, injectable for tests
 * @returns true when the process exists (EPERM: it exists but belongs to another user), false on ESRCH;
 * any other error is rethrown
 */
export function isProcessAlive(pid: number, kill: (pid: number, signal: number) => true = process.kill): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    throw err;
  }
}

/**
 * Decides whether a lock file found at startup is stale. Never probes a pid below 1: process.kill treats 0 and
 * negative values as process groups.
 *
 * @param content - The lock file content, the pid of the process that claimed it
 * @param ownPid - The pid of this process
 * @param isAlive - Liveness probe for a pid of 1 or more
 * @returns Why the lock is stale, or null when a live process holds it
 */
export function getStaleLockReason(content: string, ownPid: number, isAlive: (pid: number) => boolean): string | null {
  const text = content.trim();
  const pid = Number(text);
  if (!/^\d+$/.test(text) || pid < 1 || pid > MAX_PID) return `invalid pid "${text}"`;
  if (pid === ownPid) return `pid ${pid} is this process`;
  return isAlive(pid) ? null : `pid ${pid} is not running`;
}

type StaleLockDependencies = {
  lockDir?: string;
  readDirFn?: (dir: string) => Promise<string[]>;
  readFileFn?: (file: string) => Promise<string>;
  unlinkFileFn?: (file: string) => Promise<void>;
  isAliveFn?: (pid: number) => boolean;
  ownPid?: number;
};

/**
 * Removes the lock files left behind by processes that no longer run (SIGKILL, OOM, host crash), which would
 * otherwise make every claimLock of their route throw. Meant to run once at startup, before any route claims a lock.
 * Covers every .pid file in the directory claimLock writes to. A lock is removed when its content is not a pid, is the
 * pid of this process, or is the pid of a process that is not running; a lock held by a live process stays.
 * Never throws: a missing directory removes nothing, and a file that cannot be handled emits EXCEPTION.
 *
 * @param emitter - Emits LOCK_RELEASED for each removed lock and EXCEPTION for each failure
 * @param dependencies - Directory, FS methods, liveness probe and pid to be used
 */
export async function removeStaleLocks(emitter: EventEmitter, dependencies: StaleLockDependencies = {}): Promise<void> {
  const {
    lockDir = dirname(getLockFilePath("", 0, 0)),
    readDirFn = (dir: string) => fs.promises.readdir(dir),
    readFileFn = (file: string) => fs.promises.readFile(file, "utf8"),
    unlinkFileFn = (file: string) => fs.promises.unlink(file),
    isAliveFn = (pid: number) => isProcessAlive(pid),
    ownPid = process.pid,
  } = dependencies;

  let files: string[];
  try {
    files = await readDirFn(lockDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      emitter.emit(BotEvents.EXCEPTION, new Error(`Failed to list lock files in ${lockDir}: ${err}`));
    }
    return;
  }

  for (const file of files.filter((f) => f.endsWith(".pid"))) {
    const lockFile = join(lockDir, file);
    try {
      const reason = getStaleLockReason(await readFileFn(lockFile), ownPid, isAliveFn);
      if (reason === null) continue;
      await unlinkFileFn(lockFile);
      emitter.emit(BotEvents.LOCK_RELEASED, `Stale lock file ${lockFile} deleted: ${reason}.`);
    } catch (err) {
      emitter.emit(BotEvents.EXCEPTION, new Error(`Failed to check lock file ${lockFile}: ${err}`));
    }
  }
}
