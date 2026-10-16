import { EventEmitter } from "events";
import { start } from "./relayer";
import { removeStaleLocks } from "./utils/lock";
import { runHashiExecutor } from "./utils/hashi";
import { delay, ShutdownManager } from "./utils/relayerHelpers";
import { Network } from "./consts/bridgeRoutes";

jest.mock("./utils/lock", () => ({
  ...jest.requireActual("./utils/lock"),
  removeStaleLocks: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("./utils/hashi", () => ({ runHashiExecutor: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./utils/heartbeat", () => ({ sendHeartbeat: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./utils/logger", () => ({ initialize: jest.fn() }));
jest.mock("./utils/relayerHelpers", () => ({
  ...jest.requireActual("./utils/relayerHelpers"),
  setupExitHandlers: jest.fn().mockResolvedValue(undefined),
  delay: jest.fn(),
}));

describe("relayer", () => {
  describe("start", () => {
    it("F6.f: removes stale locks once, before the first route is processed", async () => {
      const shutdownManager = new ShutdownManager(false);
      const emitter = new EventEmitter();
      // Two loop iterations: the route runs in the first; the second wait shuts the loop down
      let waits = 0;
      (delay as jest.Mock).mockImplementation(async () => {
        waits++;
        if (waits >= 2) shutdownManager.triggerShutdown();
      });
      const networkConfigs = [
        { sourceChainId: 10200, targetChainId: 11155111, network: Network.TESTNET, senders: [], isHashi: true },
      ];

      await start({ networkConfigs, shutdownManager, emitter });

      expect(removeStaleLocks).toHaveBeenCalledTimes(1);
      expect(removeStaleLocks).toHaveBeenCalledWith(emitter);
      expect(runHashiExecutor).toHaveBeenCalledTimes(1);
      expect((removeStaleLocks as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
        (runHashiExecutor as jest.Mock).mock.invocationCallOrder[0]
      );
      expect(waits).toBe(2);
    });
  });
});
