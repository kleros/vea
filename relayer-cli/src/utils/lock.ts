import fs from "fs";

/**
 * Returns the lock file path for a given network and chain id
 *
 * @param network - The network name
 * @param chainId - The numerical identifier of the chain
 * @returns The lock file path
 *
 * @example
 * getLockFilePath('goerli', 1); // './state/goerli_1.pid'
 */
export function getLockFilePath(network: string, chainId: number) {
  return `./state/${network.toLowerCase()}_${chainId}.pid`;
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
 * @param chain - The chain id
 * @param dependencies - FS methods to be used
 *
 * @example
 * claimLock('/opt/app/lock.pid');
 */
export function claimLock(
  network: string,
  chain: number,
  dependencies: ClaimLockDependencies = {
    fileExistsFn: fs.existsSync,
    writeFileFn: fs.writeFileSync,
  }
) {
  const path = getLockFilePath(network, chain);
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
 * @param chainId - The numerical identifier of the chain
 * @param dependencies - FS methods to be used
 *
 * @example
 * releaseLock('/opt/app/lock.pid');
 */
export function releaseLock(
  network: string,
  chain: number,
  dependencies: ReleaseLockDependencies = {
    fileExistsFn: fs.existsSync,
    unlinkFileFn: fs.unlinkSync,
  }
) {
  const { fileExistsFn, unlinkFileFn } = dependencies;
  const path = getLockFilePath(network, chain);

  if (!fileExistsFn(path)) return;
  unlinkFileFn(path);
}
