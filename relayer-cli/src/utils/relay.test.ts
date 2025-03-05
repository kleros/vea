import { EventEmitter } from "node:events";
import { relayBatch } from "./relay";
import { BotEvents } from "./botEvents";
class MockEmitter extends EventEmitter {
  emit(event: string | symbol, ...args: any[]): boolean {
    // Prevent console logs for BotEvents during tests
    if (Object.values(BotEvents).includes(event as BotEvents)) {
      return true;
    }
    return super.emit(event, ...args);
  }
}

describe("relay", () => {
  describe("relayBatch", () => {
    let mockEmitter = new MockEmitter();
    const veaOutboxAddress = "0x123";
    const network = "testing" as any;
    const chainId = 1;
    const nonce = 0;
    const maxBatchSize = 10;

    let fetchBridgeConfig: jest.Mock;
    let fetchCount: jest.Mock;
    let fetchVeaOutbox: jest.Mock;
    let fetchProofAtCount: jest.Mock;
    let fetchMessageDataToRelay: jest.Mock;
    let fetchBatcher: jest.Mock;

    let mockWait: jest.Mock;
    let mockBatchSend: jest.Mock & { estimateGas?: jest.Mock };

    let veaOutboxMock: any;

    beforeEach(() => {
      fetchBridgeConfig = jest.fn().mockReturnValue({
        batcherAddress: veaOutboxAddress,
        veaContracts: {
          [network]: {
            veaInbox: { address: "0xInbox", abi: ["dummyInboxAbi"] },
            veaOutbox: { address: veaOutboxAddress, abi: ["dummyOutboxAbi"] },
          },
        },
        rpcOutbox: "https://rpc.example.com",
      });

      fetchCount = jest.fn().mockResolvedValue(1);

      veaOutboxMock = {
        isMsgRelayed: jest.fn().mockResolvedValue(false),
        interface: {
          encodeFunctionData: jest.fn().mockImplementation((fnName, args) => {
            return `callData_${args[1]}`;
          }),
        },
      };

      fetchVeaOutbox = jest.fn().mockReturnValue(veaOutboxMock);

      fetchProofAtCount = jest.fn().mockResolvedValue([]);
      fetchMessageDataToRelay = jest.fn().mockResolvedValue(["to", "data"]);

      mockWait = jest.fn().mockResolvedValue("receipt");
      mockBatchSend = jest.fn().mockResolvedValue({ wait: mockWait });

      mockBatchSend.estimateGas = jest.fn().mockResolvedValue(500000);

      fetchBatcher = jest.fn().mockReturnValue({
        batchSend: mockBatchSend,
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it("should not relay any messages if there are no messages to relay", async () => {
      fetchCount.mockResolvedValue(0);
      const updatedNonce = await relayBatch({
        chainId,
        network,
        nonce,
        maxBatchSize,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchCount,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        fetchBatcher, // Injecting our batcher mock
      });
      expect(mockBatchSend).not.toHaveBeenCalled();
      expect(updatedNonce).toBe(0);
    });

    it("should relay a single message", async () => {
      fetchCount.mockResolvedValue(1);
      const updatedNonce = await relayBatch({
        chainId,
        network,
        nonce,
        maxBatchSize,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchCount,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        fetchBatcher,
      });
      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      // With an estimated gas of 500000, the computed gasLimit is (500000 * 120)/100 = 600000.
      expect(mockBatchSend).toHaveBeenCalledWith([veaOutboxAddress], [0], ["callData_0"], { gasLimit: 600000 });
      expect(updatedNonce).toBe(1);
    });

    it("should relay multiple messages in a single batch", async () => {
      fetchCount.mockResolvedValue(7);
      const updatedNonce = await relayBatch({
        chainId,
        network,
        nonce,
        maxBatchSize,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchCount,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        fetchBatcher,
      });
      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      const expectedTargets = Array(7).fill(veaOutboxAddress);
      const expectedValues = Array(7).fill(0);
      const expectedDatas = Array.from({ length: 7 }, (_, index) => `callData_${index}`);
      expect(mockBatchSend).toHaveBeenCalledWith(expectedTargets, expectedValues, expectedDatas, { gasLimit: 600000 });
      expect(updatedNonce).toBe(7);
    });

    it("should relay multiple messages in multiple batches", async () => {
      fetchCount.mockResolvedValue(15);
      const updatedNonce = await relayBatch({
        chainId,
        network,
        nonce,
        maxBatchSize,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchCount,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        fetchBatcher,
      });
      expect(mockBatchSend).toHaveBeenCalledTimes(2);
      // First batch: 10 messages.
      const firstBatchTargets = Array(10).fill(veaOutboxAddress);
      const firstBatchValues = Array(10).fill(0);
      const firstBatchDatas = Array.from({ length: 10 }, (_, index) => `callData_${index}`);
      // Second batch: remaining 5 messages.
      const secondBatchTargets = Array(5).fill(veaOutboxAddress);
      const secondBatchValues = Array(5).fill(0);
      const secondBatchDatas = Array.from({ length: 5 }, (_, index) => `callData_${index + 10}`);
      expect(mockBatchSend).toHaveBeenNthCalledWith(1, firstBatchTargets, firstBatchValues, firstBatchDatas, {
        gasLimit: 600000,
      });
      expect(mockBatchSend).toHaveBeenNthCalledWith(2, secondBatchTargets, secondBatchValues, secondBatchDatas, {
        gasLimit: 600000,
      });
      expect(updatedNonce).toBe(15);
    });

    it("should not relay messages that have already been relayed", async () => {
      fetchCount.mockResolvedValue(3);

      veaOutboxMock.isMsgRelayed = jest.fn().mockImplementation((n) => Promise.resolve(n === 1));
      const updatedNonce = await relayBatch({
        chainId,
        network,
        nonce,
        maxBatchSize,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchCount,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        fetchBatcher,
      });
      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      // Only messages for nonce 0 and nonce 2 should be batched.
      const expectedTargets = [veaOutboxAddress, veaOutboxAddress];
      const expectedValues = [0, 0];
      const expectedDatas = ["callData_0", "callData_2"];
      expect(mockBatchSend).toHaveBeenCalledWith(expectedTargets, expectedValues, expectedDatas, { gasLimit: 600000 });
      expect(updatedNonce).toBe(3);
    });
  });
});
