import { abi } from "web3/lib/commonjs/eth.exports";
import { relayBatch } from "./relay";

describe("relay", () => {
  describe("relayBatch", () => {
    const veaOutboxAddress = "0x123";
    const chainId = 1;
    const nonce = 0;
    const maxBatchSize = 10;
    const fetchBridgeConfig = jest.fn();
    const fetchCount = jest.fn();
    const setBatchedSend = jest.fn();
    const fetchVeaOutbox = jest.fn();
    const fetchProofAtCount = jest.fn();
    const fetchMessageDataToRelay = jest.fn();
    const web3 = jest.fn() as any;
    const mockBatchedSend = jest.fn(async (txns) => Promise.resolve());
    beforeEach(() => {
      fetchBridgeConfig.mockReturnValue({
        veaOutboxContract: {
          abi: [],
        },
      });
      fetchCount.mockReturnValue(1);
      setBatchedSend.mockReturnValue(mockBatchedSend);
      fetchVeaOutbox.mockReturnValue({
        isMsgRelayed: jest.fn(),
        sendMessage: jest.fn(),
      });
      fetchProofAtCount.mockReturnValue([]);
      fetchMessageDataToRelay.mockReturnValue(["to", "data"]);
      web3.mockReturnValue({
        eth: {
          Contract: jest.fn().mockReturnValue({
            methods: {
              sendMessage: jest.fn(),
            },
            options: {
              address: veaOutboxAddress,
            },
          }),
        },
      });
    });
    afterEach(() => {
      jest.clearAllMocks();
    });
    it("should not relay any messages if there are no messages to relay", async () => {
      fetchCount.mockReturnValue(0);
      const sendBatch = jest.fn();
      setBatchedSend.mockReturnValue({
        sendBatch,
      });
      const updatedNonce = await relayBatch({
        chainId,
        nonce,
        maxBatchSize,
        fetchBridgeConfig,
        fetchCount,
        setBatchedSend,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        web3,
      });
      expect(sendBatch).not.toHaveBeenCalled();
      expect(updatedNonce).toBe(0);
    });

    it("should relay a single message", async () => {
      fetchCount.mockReturnValue(1);
      const updatedNonce = await relayBatch({
        chainId,
        nonce,
        maxBatchSize,
        fetchBridgeConfig,
        fetchCount,
        setBatchedSend,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        web3,
      });
      expect(mockBatchedSend).toHaveBeenCalledTimes(1);
      expect(mockBatchedSend).toHaveBeenCalledWith([
        {
          args: [[], 0, "to", "data"],
          method: expect.any(Function), // sendMessage function
          to: veaOutboxAddress,
        },
      ]);
      expect(updatedNonce).toBe(1);
    });

    it("should relay multiple messages in a single batch", async () => {
      fetchCount.mockReturnValue(7);
      const updatedNonce = await relayBatch({
        chainId,
        nonce,
        maxBatchSize,
        fetchBridgeConfig,
        fetchCount,
        setBatchedSend,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        web3,
      });
      expect(mockBatchedSend).toHaveBeenCalledTimes(1);
      const expectedCalls = Array.from({ length: 7 }, (_, index) => ({
        args: [[], index, "to", "data"],
        method: expect.any(Function),
        to: veaOutboxAddress,
      }));

      expect(mockBatchedSend).toHaveBeenCalledWith(expectedCalls);

      expect(updatedNonce).toBe(7);
    });
    it("should relay multiple messages in multiple batches", async () => {
      fetchCount.mockReturnValue(15);
      const updatedNonce = await relayBatch({
        chainId,
        nonce,
        maxBatchSize,
        fetchBridgeConfig,
        fetchCount,
        setBatchedSend,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        web3,
      });
      expect(mockBatchedSend).toHaveBeenCalledTimes(2);
      const firstBatchCalls = Array.from({ length: 10 }, (_, index) => ({
        args: [[], index, "to", "data"],
        method: expect.any(Function),
        to: veaOutboxAddress,
      }));

      const secondBatchCalls = Array.from({ length: 5 }, (_, index) => ({
        args: [[], index + 10, "to", "data"],
        method: expect.any(Function),
        to: veaOutboxAddress,
      }));

      expect(mockBatchedSend).toHaveBeenNthCalledWith(1, firstBatchCalls);
      expect(mockBatchedSend).toHaveBeenNthCalledWith(2, secondBatchCalls);
      expect(updatedNonce).toBe(15);
    });
    it("should not relay messages that have already been relayed", async () => {
      fetchCount.mockReturnValue(3);
      fetchVeaOutbox.mockReturnValue({
        isMsgRelayed: jest.fn().mockImplementation((nonce) => nonce === 1),
        sendMessage: jest.fn(),
      });
      const updatedNonce = await relayBatch({
        chainId,
        nonce,
        maxBatchSize,
        fetchBridgeConfig,
        fetchCount,
        setBatchedSend,
        fetchVeaOutbox,
        fetchProofAtCount,
        fetchMessageDataToRelay,
        web3,
      });
      expect(mockBatchedSend).toHaveBeenCalledTimes(1);
      const batchCall = [
        {
          args: [[], 0, "to", "data"],
          method: expect.any(Function),
          to: veaOutboxAddress,
        },
        {
          args: [[], 2, "to", "data"],
          method: expect.any(Function),
          to: veaOutboxAddress,
        },
      ];
      expect(mockBatchedSend).toHaveBeenCalledWith(batchCall);
      expect(updatedNonce).toBe(3);
    });
  });
});
