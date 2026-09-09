import fs from "fs";

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
