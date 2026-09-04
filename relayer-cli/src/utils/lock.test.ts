import { claimLock, getLockFilePath, LockfileExistsError, releaseLock } from "./lock";

describe("Lock", () => {
  describe("getLockFilePath", () => {
    it("should return the lock file path for a given network and chain ids", () => {
      const network = "mainnet";
      const sourceChainId = 1;
      const targetChainId = 2;

      const result = getLockFilePath(network, sourceChainId, targetChainId);
      expect(result).toBe("./state/mainnet_1_2.pid");
    });

    it("should ensure the network name is lowercase", () => {
      const network = "MAINNET";
      const sourceChainId = 1;
      const targetChainId = 2;

      const result = getLockFilePath(network, sourceChainId, targetChainId);
      expect(result).toBe("./state/mainnet_1_2.pid");
    });
  });

  describe("claimLock", () => {
    const network = "mainnet";
    const sourceChainId = 1;
    const targetChainId = 2;
    const expectedLockFilePath = getLockFilePath(network, sourceChainId, targetChainId);

    it("should throw an error if the lockfile already exists", () => {
      const deps = {
        fileExistsFn: jest.fn().mockReturnValue(true),
      };

      expect(() => claimLock(network, sourceChainId, targetChainId, deps)).toThrow(LockfileExistsError);
    });

    it("should write a file with the PID if none exists", () => {
      const deps = {
        fileExistsFn: jest.fn().mockReturnValue(false),
        writeFileFn: jest.fn(),
      };

      claimLock(network, sourceChainId, targetChainId, deps);

      expect(deps.fileExistsFn).toHaveBeenCalledTimes(1);
      expect(deps.writeFileFn).toHaveBeenCalledTimes(1);

      const [path, pid] = deps.writeFileFn.mock.calls[0];
      expect(path).toBe(expectedLockFilePath);
      expect(pid).toBe(process.pid.toString());
    });
  });

  describe("releaseLock", () => {
    const network = "mainnet";
    const sourceChainId = 1;
    const targetChainId = 2;
    const expectedLockFilePath = getLockFilePath(network, sourceChainId, targetChainId);

    it("should remove the lockfile if it exists", () => {
      const deps = {
        fileExistsFn: jest.fn().mockReturnValue(true),
        unlinkFileFn: jest.fn(),
      };

      releaseLock(network, sourceChainId, targetChainId, deps);

      expect(deps.fileExistsFn).toHaveBeenCalledTimes(1);
      expect(deps.unlinkFileFn).toHaveBeenCalledTimes(1);

      const [path] = deps.unlinkFileFn.mock.calls[0];
      expect(path).toBe(expectedLockFilePath);
    });

    it("should do nothing if the file does not exist", () => {
      const deps = {
        fileExistsFn: jest.fn().mockReturnValue(false),
        unlinkFileFn: jest.fn(),
      };

      releaseLock(network, sourceChainId, targetChainId, deps);

      expect(deps.fileExistsFn).toHaveBeenCalledTimes(1);
      expect(deps.unlinkFileFn).not.toHaveBeenCalled();
    });
  });
});
