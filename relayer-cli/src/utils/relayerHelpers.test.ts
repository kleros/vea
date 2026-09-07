import path from "path";
import EventEmitter from "events";
import { initialize, updateStateFile, cleanupAllLockFiles, setupExitHandlers, ShutdownManager } from "./relayerHelpers";

describe("relayerHelpers", () => {
  const emitter = new EventEmitter();
  const sourceChainId = 1;
  const targetChainId = 2;
  const network = "testing";
  const claimLock = jest.fn();
  const mockUpdateStateFile = jest.fn();
  const fileSystem = {
    readFileSync: jest.fn(),
    existsSync: jest.fn(),
    writeFileSync: jest.fn(),
    promises: {
      unlink: jest.fn(),
      readdir: jest.fn(),
      readFile: jest.fn(),
    },
  };
  const releaseLock = jest.fn();
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe("initialize", () => {
    it("should claimLock and create a state file if it doesn't exist", async () => {
      fileSystem.existsSync.mockReturnValue(false);
      fileSystem.readFileSync.mockReturnValue('{"nonce":0}');
      const { nonce } = await initialize(
        sourceChainId,
        targetChainId,
        network,
        emitter as any,
        claimLock,
        mockUpdateStateFile,
        fileSystem as any
      );
      expect(claimLock).toHaveBeenCalledWith(network, sourceChainId, targetChainId);
      expect(mockUpdateStateFile).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        expect.any(Number),
        0,
        network,
        emitter
      );
      expect(nonce).toBe(0);
    });
    it("should claimLock and return nonce from existing state file", async () => {
      fileSystem.existsSync.mockReturnValue(true);
      fileSystem.readFileSync.mockReturnValue('{"nonce":10}');
      const { nonce } = await initialize(
        sourceChainId,
        targetChainId,
        network,
        emitter as any,
        claimLock,
        mockUpdateStateFile,
        fileSystem as any
      );
      expect(claimLock).toHaveBeenCalledWith(network, sourceChainId, targetChainId);
      expect(mockUpdateStateFile).not.toHaveBeenCalled();
      expect(nonce).toBe(10);
    });
  });

  describe("updateStateFile", () => {
    it("should write a state file with the provided nonce", async () => {
      const createdTimestamp = 123456;
      const fileDirectory = process.env.STATE_DIR + network + "_" + sourceChainId + "_" + targetChainId + ".json";
      await updateStateFile(
        sourceChainId,
        targetChainId,
        createdTimestamp,
        10,
        network,
        emitter as any,
        fileSystem as any,
        releaseLock
      );
      expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
        fileDirectory,
        JSON.stringify({ ts: createdTimestamp, nonce: 10 }),
        { encoding: "utf8" }
      );
      expect(releaseLock).toHaveBeenCalledWith(network, sourceChainId, targetChainId);
    });
  });

  describe("cleanupAllLockFiles", () => {
    const stateDir = process.env.STATE_DIR || "";
    const pidFileName = `${network}_${sourceChainId}_${targetChainId}.pid`;
    const pidFilePath = path.join(stateDir, pidFileName);

    it("should return early if state directory does not exist", async () => {
      fileSystem.existsSync.mockReturnValue(false);
      await cleanupAllLockFiles(emitter as any, fileSystem as any);
      expect(fileSystem.promises.readdir).not.toHaveBeenCalled();
      expect(fileSystem.promises.unlink).not.toHaveBeenCalled();
    });
    it("should delete the .pid file if it belongs to the current process", async () => {
      fileSystem.existsSync.mockReturnValue(true);
      fileSystem.promises.readdir.mockResolvedValue([pidFileName]);
      fileSystem.promises.readFile.mockResolvedValue(String(process.pid));
      fileSystem.promises.unlink.mockResolvedValue(undefined);
      await cleanupAllLockFiles(emitter as any, fileSystem as any);
      expect(fileSystem.promises.unlink).toHaveBeenCalledWith(pidFilePath);
    });
    it("should not delete the .pid file if it belongs to a different process", async () => {
      fileSystem.existsSync.mockReturnValue(true);
      fileSystem.promises.readdir.mockResolvedValue([pidFileName]);
      fileSystem.promises.readFile.mockResolvedValue(String(process.pid + 1));
      await cleanupAllLockFiles(emitter as any, fileSystem as any);
      expect(fileSystem.promises.unlink).not.toHaveBeenCalled();
    });
    it("should not attempt to delete files when no .pid files exist", async () => {
      fileSystem.existsSync.mockReturnValue(true);
      fileSystem.promises.readdir.mockResolvedValue(["state.json"]);
      await cleanupAllLockFiles(emitter as any, fileSystem as any);
      expect(fileSystem.promises.unlink).not.toHaveBeenCalled();
    });
  });

  describe("setupExitHandlers", () => {
    let shutdownManager: ShutdownManager;
    let exitSpy: jest.SpyInstance;
    let capturedExitCode: number | undefined;

    beforeEach(() => {
      shutdownManager = new ShutdownManager();
      capturedExitCode = undefined;

      exitSpy = jest.spyOn(process, "exit").mockImplementation((code?: number) => {
        capturedExitCode = code;
        return undefined as never;
      });

      setupExitHandlers(shutdownManager, emitter);
    });

    afterEach(() => {
      exitSpy.mockRestore();
      process.removeAllListeners("SIGINT");
      process.removeAllListeners("SIGTERM");
      process.removeAllListeners("SIGQUIT");
      process.removeAllListeners("exit");
      process.removeAllListeners("uncaughtException");
      process.removeAllListeners("unhandledRejection");
      emitter.removeAllListeners("EXIT");
    });

    it("should register signal handlers for SIGINT, SIGTERM, and SIGQUIT", () => {
      expect(process.listenerCount("SIGINT")).toBeGreaterThan(0);
      expect(process.listenerCount("SIGTERM")).toBeGreaterThan(0);
      expect(process.listenerCount("SIGQUIT")).toBeGreaterThan(0);
    });

    it("should trigger shutdown and cleanup on SIGINT signal", async () => {
      process.emit("SIGINT");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(shutdownManager.getIsShuttingDown()).toBe(true);
      expect(capturedExitCode).toBe(0);
    });

    it("should trigger shutdown and cleanup on SIGTERM signal", async () => {
      process.emit("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(shutdownManager.getIsShuttingDown()).toBe(true);
      expect(capturedExitCode).toBe(0);
    });

    it("should trigger shutdown and cleanup on SIGQUIT signal", async () => {
      process.emit("SIGQUIT");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(shutdownManager.getIsShuttingDown()).toBe(true);
      expect(capturedExitCode).toBe(0);
    });
  });
});
