import EventEmitter from "events";
import { initialize, updateStateFile } from "./relayerHelpers";

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
      fileSystem.readFileSync.mockReturnValue('{"nonce":0}');
      const nonce = await initialize(
        chainId,
        network,
        emitter as any,
        claimLock,
        mockUpdateStateFile,
        fileSystem as any
      );
      expect(claimLock).toHaveBeenCalledWith(network, chainId);
      expect(mockUpdateStateFile).toHaveBeenCalledWith(chainId, expect.any(Number), 0, network, emitter);
      expect(nonce).toBe(0);
    });
    it("should claimLock and return nonce from existing state file", async () => {
      fileSystem.existsSync.mockReturnValue(true);
      fileSystem.readFileSync.mockReturnValue('{"nonce":10}');
      const nonce = await initialize(
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
    });
  });

  describe("updateStateFile", () => {
    it("should write a state file with the provided nonce", async () => {
      const createdTimestamp = 123456;
      const fileDirectory = process.env.STATE_DIR + network + "_" + chainId + ".json";
      await updateStateFile(chainId, createdTimestamp, 10, network, emitter as any, fileSystem as any, releaseLock);
      expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
        fileDirectory,
        JSON.stringify({ ts: createdTimestamp, nonce: 10 }),
        { encoding: "utf8" }
      );
      expect(releaseLock).toHaveBeenCalledWith(network, chainId);
    });
  });

  describe("setupExitHandlers", () => {
    it.todo("should register signal handlers for SIGINT, SIGTERM, and SIGQUIT");

    it.todo("should trigger shutdown and cleanup on SIGINT signal");

    it.todo("should trigger shutdown and cleanup on SIGTERM signal");

    it.todo("should trigger shutdown and cleanup on SIGQUIT signal");
  });
});
