import EventEmitter from "events";
import { initialize, updateStateFile, cleanupLockFile, setupExitHandlers, ShutdownManager } from "./relayerHelpers";

describe("relayerHelpers", () => {
  const emitter = new EventEmitter();
  const chainId = 1;
  const network = "testing";
  const claimLock = jest.fn();
  const mockUpdateStateFile = jest.fn();
  const fileSystem = {
    readFileSync: jest.fn(),
    existsSync: jest.fn(),
    writeFileSync: jest.fn(),
    promises: {
      unlink: jest.fn(),
    },
  };
  const releaseLock = jest.fn();
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe("initialize", () => {
    it("should claimLock and create a state file if it doesn't exist", async () => {
      fileSystem.existsSync.mockReturnValue(false);
      fileSystem.readFileSync.mockReturnValue('{"hashiNonce":0,"nonce":0}');
      const { hashiNonce, nonce } = await initialize(
        chainId,
        network,
        emitter as any,
        claimLock,
        mockUpdateStateFile,
        fileSystem as any
      );
      expect(claimLock).toHaveBeenCalledWith(network, chainId);
      expect(mockUpdateStateFile).toHaveBeenCalledWith(chainId, expect.any(Number), 0, 0, network, emitter);
      expect(nonce).toBe(0);
      expect(hashiNonce).toBe(0);
    });
    it("should claimLock and return nonce from existing state file", async () => {
      fileSystem.existsSync.mockReturnValue(true);
      fileSystem.readFileSync.mockReturnValue('{"hashiNonce":10,"nonce":10}');
      const { hashiNonce, nonce } = await initialize(
        chainId,
        network,
        emitter as any,
        claimLock,
        mockUpdateStateFile,
        fileSystem as any
      );
      expect(claimLock).toHaveBeenCalledWith(network, chainId);
      expect(mockUpdateStateFile).not.toHaveBeenCalled();
      expect(nonce).toBe(10);
      expect(hashiNonce).toBe(10);
    });
  });

  describe("updateStateFile", () => {
    it("should write a state file with the provided nonce", async () => {
      const createdTimestamp = 123456;
      const fileDirectory = process.env.STATE_DIR + network + "_" + chainId + ".json";
      await updateStateFile(chainId, createdTimestamp, 10, 10, network, emitter as any, fileSystem as any, releaseLock);
      expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
        fileDirectory,
        JSON.stringify({ ts: createdTimestamp, nonce: 10, hashiNonce: 10 }),
        { encoding: "utf8" }
      );
      expect(releaseLock).toHaveBeenCalledWith(network, chainId);
    });
  });

  describe("cleanupLockFile", () => {
    it("should delete the .pid file if it exists", async () => {
      const stateDir = process.env.STATE_DIR || "";
      const pidFile = stateDir + network + "_" + chainId + ".pid";
      // Simulate that the .pid file exists.
      fileSystem.existsSync.mockReturnValue(true);
      await cleanupLockFile(chainId, network, emitter, fileSystem as any);
      expect(fileSystem.promises.unlink).toHaveBeenCalledWith(pidFile);
    });
    it("should not attempt to delete the .pid file if it does not exist", async () => {
      fileSystem.existsSync.mockReturnValue(false);
      await cleanupLockFile(chainId, network, emitter, fileSystem as any);
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

      setupExitHandlers(chainId, shutdownManager, network, emitter);
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
