import { EventEmitter } from "node:events";
import { makeError } from "ethers";
import { relay, relayAllFrom, relayBatch } from "./relay";
import { BotEvents } from "./botEvents";
import { ExecutionError } from "./errors";
import { T1, T2, T3, R1, R3 } from "../tests/relay/revertFixtures";
// The error ethers' TransactionResponse.wait rejects with when its timeout elapses
const waitTimeout = makeError("wait for transaction timeout", "TIMEOUT");

// The nonces carried by a batchSend call, read back from the mocked call data `callData_<nonce>`
const batchNonces = (batchSend: jest.Mock, call: number): number[] =>
  batchSend.mock.calls[call][2].map((data: string) => Number(data.replace("callData_", "")));

// A staticCall mock that rejects with the given error for one nonce and passes for the others
const failingAt = (failingNonce: number, error: unknown) =>
  jest
    .fn()
    .mockImplementation((_proof, nonce) => (nonce === failingNonce ? Promise.reject(error) : Promise.resolve(true)));

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
    const targetChainId = 1;
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
        sendMessage: {
          staticCall: jest.fn().mockResolvedValue(true),
        },
      };

      fetchVeaOutbox = jest.fn().mockReturnValue(veaOutboxMock);

      fetchProofAtCount = jest.fn().mockResolvedValue([]);
      fetchMessageDataToRelay = jest.fn().mockResolvedValue(["to", "from", "data"]);

      mockWait = jest.fn().mockResolvedValue("receipt");
      mockBatchSend = jest.fn().mockResolvedValue({ wait: mockWait });

      mockBatchSend.estimateGas = jest.fn().mockResolvedValue(600000);

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
        targetChainId,
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
      expect(mockBatchSend).not.toHaveBeenCalled();
      expect(updatedNonce).toBe(0);
    });

    it("should relay a single message", async () => {
      fetchCount.mockResolvedValue(1);
      const updatedNonce = await relayBatch({
        targetChainId,
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
        targetChainId,
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
        targetChainId,
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
        targetChainId,
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

    describe("when a staticCall fails", () => {
      let emitSpy: jest.SpyInstance;

      const callRelayBatch = () =>
        relayBatch({
          targetChainId,
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

      beforeEach(() => {
        emitSpy = jest.spyOn(mockEmitter, "emit");
      });

      afterEach(() => {
        emitSpy.mockRestore();
      });

      it.each([
        ["T1", T1],
        ["T3", T3],
      ])(
        "F4.a: stops at a %s transport error, sends the messages before it and returns its nonce",
        async (_id, error) => {
          fetchCount.mockResolvedValue(7);
          veaOutboxMock.sendMessage.staticCall = failingAt(3, error);

          const updatedNonce = await callRelayBatch();

          expect(mockBatchSend).toHaveBeenCalledTimes(1);
          expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2]);
          expect(veaOutboxMock.sendMessage.staticCall.mock.calls.map((call: any[]) => call[1])).toEqual([0, 1, 2, 3]);
          expect(fetchCount).toHaveBeenCalledTimes(1);
          expect(updatedNonce).toBe(3);
        }
      );

      it("F4.b: skips an R3 revert when the count read again is unchanged", async () => {
        fetchCount.mockResolvedValue(7);
        veaOutboxMock.sendMessage.staticCall = failingAt(3, R3);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2, 4, 5, 6]);
        expect(fetchCount).toHaveBeenCalledTimes(2);
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.MESSAGE_EXECUTION_FAILED, targetChainId, network, 3, R3);
        expect(updatedNonce).toBe(7);
      });

      it("F4.c: drops the current batch on an R3 revert when the count changed, keeping the batches already sent", async () => {
        fetchCount.mockResolvedValueOnce(15).mockResolvedValueOnce(16);
        veaOutboxMock.sendMessage.staticCall = failingAt(12, R3);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(updatedNonce).toBe(10);
      });

      it("walks a large backlog one nonce at a time instead of listing it before relaying", async () => {
        // A count whose reads are capped: listing every nonce below it up front would read it past the cap
        let countReads = 0;
        const hugeCount = {
          valueOf: () => {
            countReads += 1;
            if (countReads > 100) throw new Error("count read for every nonce of the backlog");
            return Number.MAX_SAFE_INTEGER;
          },
        };
        fetchCount.mockResolvedValue(hugeCount);
        veaOutboxMock.sendMessage.staticCall = failingAt(3, T1);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2]);
        expect(updatedNonce).toBe(3);
      });

      it("throws ExecutionError when the count read again fails", async () => {
        fetchCount.mockResolvedValueOnce(7).mockRejectedValueOnce(new Error("indexer down"));
        veaOutboxMock.sendMessage.staticCall = failingAt(3, R3);

        await expect(callRelayBatch()).rejects.toBeInstanceOf(ExecutionError);
        expect(mockBatchSend).not.toHaveBeenCalled();
      });
    });

    describe("transaction wait", () => {
      const callRelayBatch = () =>
        relayBatch({
          targetChainId,
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

      it("F15.a: waits for 1 confirmation for at most 5 minutes", async () => {
        fetchCount.mockResolvedValue(1);
        await callRelayBatch();
        expect(mockWait).toHaveBeenCalledWith(1, 300000);
      });

      it("F15.b: rejects with ExecutionError when the wait times out", async () => {
        fetchCount.mockResolvedValue(1);
        mockWait.mockRejectedValue(waitTimeout);
        const result = callRelayBatch();
        await expect(result).rejects.toBeInstanceOf(ExecutionError);
        await expect(result).rejects.toHaveProperty("cause", waitTimeout);
      });
    });
  });

  describe("relayAllFrom", () => {
    const emitter = new MockEmitter();
    const veaOutboxAddress = "0x123";
    const network = "testing" as any;
    const chainId = 1;
    const senderA = "0xA";
    const senderB = "0xB";

    let noncesBySender: Record<string, number[]>;
    let veaOutboxMock: any;
    let mockWait: jest.Mock;
    let mockBatchSend: jest.Mock & { estimateGas?: jest.Mock };
    let deps: Record<string, jest.Mock>;
    let emitSpy: jest.SpyInstance;

    beforeEach(() => {
      noncesBySender = {};
      veaOutboxMock = {
        isMsgRelayed: jest.fn().mockResolvedValue(false),
        interface: {
          encodeFunctionData: jest.fn().mockImplementation((fnName, args) => `callData_${args[1]}`),
        },
        sendMessage: {
          staticCall: jest.fn().mockResolvedValue(true),
        },
      };
      mockWait = jest.fn().mockResolvedValue({ hash: "0xhash" });
      mockBatchSend = jest.fn().mockResolvedValue({ wait: mockWait });
      mockBatchSend.estimateGas = jest.fn().mockResolvedValue(600000);
      deps = {
        fetchBridgeConfig: jest.fn().mockReturnValue({
          batcherAddress: "0xBatcher",
          veaContracts: {
            [network]: {
              veaInbox: { address: "0xInbox" },
              veaOutbox: { address: veaOutboxAddress },
            },
          },
          rpcOutbox: "https://rpc.example.com",
        }),
        fetchCount: jest.fn().mockResolvedValue(20),
        fetchVeaOutbox: jest.fn().mockReturnValue(veaOutboxMock),
        fetchProofAtCount: jest.fn().mockResolvedValue([]),
        fetchMessageDataToRelay: jest.fn().mockResolvedValue(["to", "from", "data"]),
        fetchBatcher: jest.fn().mockReturnValue({ batchSend: mockBatchSend }),
        fetchNonceFrom: jest
          .fn()
          .mockImplementation((_chainId, _inbox, _nonce, sender) => Promise.resolve(noncesBySender[sender] ?? [])),
      };
      emitSpy = jest.spyOn(emitter, "emit");
    });

    afterEach(() => {
      emitSpy.mockRestore();
      jest.clearAllMocks();
    });

    const callRelayAllFrom = (nonce: number, maxBatchSize?: number) =>
      relayAllFrom(chainId, network, nonce, [senderA, senderB], emitter, maxBatchSize, deps);

    it("F13.a: leaves out the nonces the snapshot does not cover yet", async () => {
      noncesBySender = { [senderA]: [2, 5, 9] };
      deps.fetchCount.mockResolvedValue(6);

      const updatedNonce = await callRelayAllFrom(0);

      expect(deps.fetchProofAtCount.mock.calls.map((call) => call[1])).toEqual([2, 5]);
      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      expect(batchNonces(mockBatchSend, 0)).toEqual([2, 5]);
      expect(updatedNonce).toBe(6);
    });

    it("F14.a: relays the senders' messages in ascending batches of at most 10", async () => {
      noncesBySender = { [senderA]: [1, 3, 5, 7, 9, 11], [senderB]: [2, 4, 6, 8, 10, 12] };

      const updatedNonce = await callRelayAllFrom(0);

      expect(mockBatchSend).toHaveBeenCalledTimes(2);
      expect(batchNonces(mockBatchSend, 0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(batchNonces(mockBatchSend, 1)).toEqual([11, 12]);
      expect(mockBatchSend.mock.calls[0][0]).toEqual(Array(10).fill(veaOutboxAddress));
      expect(updatedNonce).toBe(13);
    });

    it("F14.a: relays a nonce listed for two senders once", async () => {
      noncesBySender = { [senderA]: [1, 2], [senderB]: [2, 3] };

      const updatedNonce = await callRelayAllFrom(0);

      expect(batchNonces(mockBatchSend, 0)).toEqual([1, 2, 3]);
      expect(updatedNonce).toBe(4);
    });

    it("F14.b: skips a message whose staticCall reverts (R1) while the count is unchanged", async () => {
      noncesBySender = { [senderA]: [1, 2, 3] };
      veaOutboxMock.sendMessage.staticCall = failingAt(2, R1);

      const updatedNonce = await callRelayAllFrom(0);

      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      expect(batchNonces(mockBatchSend, 0)).toEqual([1, 3]);
      expect(emitSpy).toHaveBeenCalledWith(BotEvents.MESSAGE_EXECUTION_FAILED, chainId, network, 2, R1);
      expect(updatedNonce).toBe(4);
    });

    it("F14.c: stops at a transport error (T2) and returns that message's nonce", async () => {
      noncesBySender = { [senderA]: [4, 9], [senderB]: [6] };
      deps.fetchCount.mockResolvedValue(10);
      veaOutboxMock.sendMessage.staticCall = failingAt(6, T2);

      const updatedNonce = await callRelayAllFrom(0);

      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      expect(batchNonces(mockBatchSend, 0)).toEqual([4]);
      expect(veaOutboxMock.sendMessage.staticCall.mock.calls.map((call: any[]) => call[1])).toEqual([4, 6]);
      expect(updatedNonce).toBe(6);
    });

    it("F14.d: drops the current batch on an R3 revert with a changed count and returns its first nonce", async () => {
      noncesBySender = { [senderA]: [3, 5, 7, 8] };
      deps.fetchCount.mockResolvedValueOnce(10).mockResolvedValueOnce(11);
      veaOutboxMock.sendMessage.staticCall = failingAt(8, R3);

      const updatedNonce = await callRelayAllFrom(0, 2);

      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      expect(batchNonces(mockBatchSend, 0)).toEqual([3, 5]);
      expect(updatedNonce).toBe(7);
    });

    it("counts messages already relayed as handled", async () => {
      noncesBySender = { [senderA]: [3, 4] };
      veaOutboxMock.isMsgRelayed.mockResolvedValue(true);

      const updatedNonce = await callRelayAllFrom(2);

      expect(mockBatchSend).not.toHaveBeenCalled();
      expect(updatedNonce).toBe(5);
    });

    it("F8.a: returns the input nonce when the count is 0", async () => {
      noncesBySender = { [senderA]: [5, 6] };
      deps.fetchCount.mockResolvedValue(0);

      const updatedNonce = await callRelayAllFrom(5);

      expect(updatedNonce).toBe(5);
      expect(deps.fetchNonceFrom).not.toHaveBeenCalled();
      expect(mockBatchSend).not.toHaveBeenCalled();
    });

    it("F8.a: returns the input nonce when there are no candidates", async () => {
      noncesBySender = { [senderB]: [25] };

      const updatedNonce = await callRelayAllFrom(5);

      expect(updatedNonce).toBe(5);
      expect(updatedNonce).not.toBeNull();
      expect(mockBatchSend).not.toHaveBeenCalled();
    });

    it("F15.a: waits for 1 confirmation for at most 5 minutes", async () => {
      noncesBySender = { [senderA]: [1] };
      await callRelayAllFrom(0);
      expect(mockWait).toHaveBeenCalledWith(1, 300000);
    });

    it("F15.b: rejects with ExecutionError when the wait times out", async () => {
      noncesBySender = { [senderA]: [1] };
      mockWait.mockRejectedValue(waitTimeout);
      const result = callRelayAllFrom(0);
      await expect(result).rejects.toBeInstanceOf(ExecutionError);
      await expect(result).rejects.toHaveProperty("cause", waitTimeout);
    });
  });

  describe("relay", () => {
    const emitter = new MockEmitter();
    const network = "testing" as any;
    let mockWait: jest.Mock;
    let deps: Record<string, jest.Mock>;

    beforeEach(() => {
      mockWait = jest.fn().mockResolvedValue({ hash: "0xhash" });
      deps = {
        fetchBridgeConfig: jest.fn().mockReturnValue({
          veaContracts: { [network]: { veaInbox: { address: "0xInbox" }, veaOutbox: { address: "0x123" } } },
          rpcOutbox: "https://rpc.example.com",
        }),
        fetchVeaOutbox: jest.fn().mockReturnValue({ sendMessage: jest.fn().mockResolvedValue({ wait: mockWait }) }),
        fetchCount: jest.fn().mockResolvedValue(5),
        fetchProofAtCount: jest.fn().mockResolvedValue([]),
        fetchMessageDataToRelay: jest.fn().mockResolvedValue(["to", "from", "data"]),
      };
    });

    it("F15.a: waits for 1 confirmation for at most 5 minutes", async () => {
      await relay(1, 2, network, emitter, deps);
      expect(mockWait).toHaveBeenCalledWith(1, 300000);
    });

    it("rejects with ExecutionError when the wait times out", async () => {
      mockWait.mockRejectedValue(waitTimeout);
      await expect(relay(1, 2, network, emitter, deps)).rejects.toBeInstanceOf(ExecutionError);
    });
  });
});
