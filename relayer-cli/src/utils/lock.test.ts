import path from "path";
import { EventEmitter } from "events";
import {
  claimLock,
  getLockFilePath,
  getStaleLockReason,
  isProcessAlive,
  LockfileExistsError,
  releaseLock,
  removeStaleLocks,
} from "./lock";
import { BotEvents } from "./botEvents";

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

  describe("isProcessAlive", () => {
    const errnoError = (code: string) => Object.assign(new Error(code), { code });

    it("reports a process that accepts signal 0 as alive", () => {
      const kill = jest.fn().mockReturnValue(true);
      expect(isProcessAlive(123, kill)).toBe(true);
      expect(kill).toHaveBeenCalledWith(123, 0);
    });

    it("reports EPERM as alive and ESRCH as dead", () => {
      expect(
        isProcessAlive(123, () => {
          throw errnoError("EPERM");
        })
      ).toBe(true);
      expect(
        isProcessAlive(123, () => {
          throw errnoError("ESRCH");
        })
      ).toBe(false);
    });

    it("rethrows any other error", () => {
      expect(() =>
        isProcessAlive(123, () => {
          throw errnoError("EINVAL");
        })
      ).toThrow("EINVAL");
    });
  });

  describe("getStaleLockReason", () => {
    it("keeps a lock whose pid is alive and removes one whose pid is not", () => {
      expect(getStaleLockReason("77\n", 1, () => true)).toBeNull();
      expect(getStaleLockReason("77", 1, () => false)).toContain("not running");
    });

    it("never probes content that is not a pid in 1..2^31-1", () => {
      const isAlive = jest.fn().mockReturnValue(true);
      for (const content of ["abc", "", "0", "-5", "1.5", "12abc", "4294967296"]) {
        expect(getStaleLockReason(content, 1, isAlive)).toContain("invalid pid");
      }
      expect(isAlive).not.toHaveBeenCalled();
    });
  });

  describe("removeStaleLocks", () => {
    const lockDir = path.dirname(getLockFilePath("testnet", 421614, 11155111));
    const ownPid = 4242;
    const livePid = 5000;
    const epermPid = 5001;
    const deadPid = 5002;
    const errnoError = (code: string) => Object.assign(new Error(code), { code });
    // Stands in for process.kill: livePid and epermPid exist, every other pid does not
    const kill = jest.fn((pid: number, _signal: number): true => {
      if (pid === livePid) return true;
      if (pid === epermPid) throw errnoError("EPERM");
      throw errnoError("ESRCH");
    });

    let files: Record<string, string>;
    let emitter: EventEmitter;
    let released: string[];
    let exceptions: Error[];
    let deps: {
      lockDir: string;
      readDirFn: jest.Mock;
      readFileFn: jest.Mock;
      unlinkFileFn: jest.Mock;
      isAliveFn: (pid: number) => boolean;
      ownPid: number;
    };

    const removedFiles = () => deps.unlinkFileFn.mock.calls.map(([file]) => path.basename(file));

    beforeEach(() => {
      kill.mockClear();
      files = {};
      deps = {
        lockDir,
        readDirFn: jest.fn(async () => Object.keys(files)),
        readFileFn: jest.fn(async (file: string) => files[path.basename(file)]),
        unlinkFileFn: jest.fn(async () => undefined),
        isAliveFn: (pid: number) => isProcessAlive(pid, kill),
        ownPid,
      };
      emitter = new EventEmitter();
      released = [];
      exceptions = [];
      emitter.on(BotEvents.LOCK_RELEASED, (message: string) => released.push(message));
      emitter.on(BotEvents.EXCEPTION, (err: Error) => exceptions.push(err));
    });

    it("removes the lock of a dead pid (ESRCH)", async () => {
      files = { "testnet_421614_11155111.pid": String(deadPid) };
      await removeStaleLocks(emitter, deps);
      expect(deps.unlinkFileFn).toHaveBeenCalledWith(path.join(lockDir, "testnet_421614_11155111.pid"));
      expect(kill).toHaveBeenCalledWith(deadPid, 0);
      expect(released).toHaveLength(1);
      expect(released[0]).toContain("testnet_421614_11155111.pid");
    });

    it("removes the lock of our own pid", async () => {
      files = { "hashi_10200_11155111.pid": String(ownPid) };
      await removeStaleLocks(emitter, deps);
      expect(removedFiles()).toEqual(["hashi_10200_11155111.pid"]);
      expect(released).toHaveLength(1);
    });

    it("keeps the locks of a live pid and of an EPERM pid", async () => {
      files = { "devnet_421614_11155111.pid": String(livePid), "testnet_421614_10200.pid": String(epermPid) };
      await removeStaleLocks(emitter, deps);
      expect(kill).toHaveBeenCalledWith(livePid, 0);
      expect(kill).toHaveBeenCalledWith(epermPid, 0);
      expect(deps.unlinkFileFn).not.toHaveBeenCalled();
      expect(released).toHaveLength(0);
    });

    it("removes locks holding abc, nothing, 0 or -5 without signalling a pid below 1", async () => {
      files = { "a.pid": "abc", "b.pid": "", "c.pid": "0", "d.pid": "-5", "e.pid": String(livePid) };
      await removeStaleLocks(emitter, deps);
      expect(removedFiles().sort()).toEqual(["a.pid", "b.pid", "c.pid", "d.pid"]);
      expect(kill.mock.calls.every(([pid]) => pid > 0)).toBe(true);
      expect(kill).toHaveBeenCalledTimes(1);
      expect(released).toHaveLength(4);
    });

    it("resolves and removes nothing when the directory is missing", async () => {
      deps.readDirFn.mockRejectedValue(errnoError("ENOENT"));
      await expect(removeStaleLocks(emitter, deps)).resolves.toBeUndefined();
      expect(deps.unlinkFileFn).not.toHaveBeenCalled();
      expect(exceptions).toHaveLength(0);
    });

    it("emits EXCEPTION for a file that fails and goes on with the others", async () => {
      files = { "a.pid": String(deadPid), "b.pid": String(deadPid), "c.pid": "x" };
      deps.unlinkFileFn.mockImplementation(async (file: string) => {
        if (path.basename(file) === "a.pid") throw errnoError("EACCES");
      });
      deps.readFileFn.mockImplementation(async (file: string) => {
        if (path.basename(file) === "c.pid") throw errnoError("EISDIR");
        return files[path.basename(file)];
      });
      await expect(removeStaleLocks(emitter, deps)).resolves.toBeUndefined();
      expect(removedFiles().sort()).toEqual(["a.pid", "b.pid"]);
      expect(released).toHaveLength(1);
      expect(exceptions).toHaveLength(2);
      expect(exceptions[0].message).toContain("a.pid");
      expect(exceptions[1].message).toContain("c.pid");
    });

    it("emits EXCEPTION and resolves when the directory cannot be read", async () => {
      deps.readDirFn.mockRejectedValue(errnoError("EACCES"));
      await expect(removeStaleLocks(emitter, deps)).resolves.toBeUndefined();
      expect(exceptions).toHaveLength(1);
    });

    it("only looks at .pid files", async () => {
      files = { "testnet_421614_11155111.json": "{}", "x.pid": String(deadPid) };
      await removeStaleLocks(emitter, deps);
      expect(deps.readFileFn).toHaveBeenCalledTimes(1);
      expect(removedFiles()).toEqual(["x.pid"]);
    });

    it("sweeps the directory claimLock writes to by default, Hashi locks included", async () => {
      const readDirFn = jest.fn().mockResolvedValue([]);
      await removeStaleLocks(emitter, { readDirFn });
      expect(readDirFn).toHaveBeenCalledWith(path.dirname(getLockFilePath("hashi", 10200, 11155111)));
      expect(readDirFn).toHaveBeenCalledWith(path.dirname(getLockFilePath("devnet", 421614, 11155111)));
    });
  });
});
