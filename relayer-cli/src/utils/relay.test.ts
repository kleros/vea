import { EventEmitter } from "node:events";
import { makeError } from "ethers";
import { relay, relayAllFrom, relayBatch } from "./relay";
import { BotEvents } from "./botEvents";
import { ExecutionError } from "./errors";
import { fixtures } from "../tests/revert/fixtures";

const { T1, T2, T3, R1, R3 } = fixtures;
// Message-specific failures (a revert or a VM abort) once read as transport: A1 is the data-less out of gas a
// returnbomb receiver causes in the outbox's frame
const MESSAGE_FAILURES = ["A1", "N1", "N4", "A3", "P8"] as const;
// Failures that take the transport action: transport failures, and the unknown failures no rule ties to the message
const TRANSPORT_FAILURES = [
  ...(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "P14"] as const),
  ...(["U1", "U2", "U3", "U4", "P11"] as const),
];
// The error ethers' TransactionResponse.wait rejects with when its timeout elapses
const waitTimeout = makeError("wait for transaction timeout", "TIMEOUT");

// The error ethers' TransactionResponse.wait rejects with when the mined transaction reverted (status 0): it carries
// the receipt and no revert data
const minedRevert = Object.assign(makeError("transaction execution reverted", "CALL_EXCEPTION", {} as any), {
  receipt: { status: 0 },
});

// A batchSend.estimateGas mock for a batch conflict: a batch of several calls reverts (R1), and so does any single
// call of a nonce in `failingAlone`
const conflictingEstimate = (failingAlone: number[] = []) =>
  jest.fn().mockImplementation((_targets, _values, datas: string[]) => {
    const conflict = datas.length > 1 || failingAlone.includes(Number(datas[0].replace("callData_", "")));
    return conflict ? Promise.reject(R1) : Promise.resolve(600000);
  });

// The nonces carried by a batchSend call, read back from the mocked call data `callData_<nonce>`
const batchNonces = (batchSend: jest.Mock, call: number): number[] =>
  batchSend.mock.calls[call][2].map((data: string) => Number(data.replace("callData_", "")));

// A staticCall mock that rejects with the given error for one nonce and passes for the others
const failingAt = (failingNonce: number, error: unknown) =>
  jest
    .fn()
    .mockImplementation((_proof, nonce) => (nonce === failingNonce ? Promise.reject(error) : Promise.resolve(true)));

// The nonces a staticCall mock was called with, in order
const staticCallNonces = (staticCall: jest.Mock) => staticCall.mock.calls.map((call: any[]) => call[1]);

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
      ])("stops at a %s transport error, sends the messages before it and returns its nonce", async (_id, error) => {
        fetchCount.mockResolvedValue(7);
        veaOutboxMock.sendMessage.staticCall = failingAt(3, error);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2]);
        expect(veaOutboxMock.sendMessage.staticCall.mock.calls.map((call: any[]) => call[1])).toEqual([0, 1, 2, 3]);
        expect(fetchCount).toHaveBeenCalledTimes(1);
        expect(updatedNonce).toBe(3);
      });

      it("skips an R3 revert when the count read again is unchanged", async () => {
        fetchCount.mockResolvedValue(7);
        veaOutboxMock.sendMessage.staticCall = failingAt(3, R3);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2, 4, 5, 6]);
        expect(fetchCount).toHaveBeenCalledTimes(2);
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.MESSAGE_EXECUTION_FAILED, targetChainId, network, 3, R3);
        expect(updatedNonce).toBe(7);
      });

      it("drops the current batch on an R3 revert when the count changed, keeping the batches already sent", async () => {
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

      it.each(MESSAGE_FAILURES)(
        "skips a message failing with %s when the count read again is unchanged",
        async (id) => {
          fetchCount.mockResolvedValue(7);
          veaOutboxMock.sendMessage.staticCall = failingAt(3, fixtures[id]);

          const updatedNonce = await callRelayBatch();

          expect(mockBatchSend).toHaveBeenCalledTimes(1);
          expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2, 4, 5, 6]);
          expect(fetchCount).toHaveBeenCalledTimes(2);
          expect(emitSpy).toHaveBeenCalledWith(
            BotEvents.MESSAGE_EXECUTION_FAILED,
            targetChainId,
            network,
            3,
            fixtures[id]
          );
          expect(updatedNonce).toBe(7);
        }
      );

      it.each(MESSAGE_FAILURES)(
        "drops the current batch on a message failing with %s when the count changed",
        async (id) => {
          fetchCount.mockResolvedValueOnce(15).mockResolvedValueOnce(16);
          veaOutboxMock.sendMessage.staticCall = failingAt(12, fixtures[id]);

          const updatedNonce = await callRelayBatch();

          expect(mockBatchSend).toHaveBeenCalledTimes(1);
          expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
          expect(fetchCount).toHaveBeenCalledTimes(2);
          expect(updatedNonce).toBe(10);
        }
      );

      it.each(TRANSPORT_FAILURES)(
        "stops at a %s transport or unknown failure with no retry, no count re-read and no skip",
        async (id) => {
          fetchCount.mockResolvedValue(7);
          veaOutboxMock.sendMessage.staticCall = failingAt(3, fixtures[id]);

          const updatedNonce = await callRelayBatch();

          expect(mockBatchSend).toHaveBeenCalledTimes(1);
          expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2]);
          expect(staticCallNonces(veaOutboxMock.sendMessage.staticCall)).toEqual([0, 1, 2, 3]);
          expect(veaOutboxMock.isMsgRelayed).toHaveBeenCalledTimes(4);
          expect(fetchCount).toHaveBeenCalledTimes(1);
          expect(emitSpy).toHaveBeenCalledWith(
            BotEvents.MESSAGE_EXECUTION_FAILED,
            targetChainId,
            network,
            3,
            fixtures[id]
          );
          expect(updatedNonce).toBe(3);
        }
      );
    });

    describe("when the batch fails", () => {
      let emitSpy: jest.SpyInstance;

      const callRelayBatch = (from = nonce) =>
        relayBatch({
          targetChainId,
          network,
          nonce: from,
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

      it("sends a passing batch in one transaction", async () => {
        fetchCount.mockResolvedValue(3);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2]);
        expect(updatedNonce).toBe(3);
      });

      it("sends the messages of a conflicting batch one by one and skips the one that fails alone", async () => {
        fetchCount.mockResolvedValue(2);
        mockBatchSend.estimateGas = conflictingEstimate([1]);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0]);
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.MESSAGE_EXECUTION_FAILED, targetChainId, network, 1, R1);
        expect(updatedNonce).toBe(2);

        // The next cycle starts past both messages and sends nothing
        const nextNonce = await callRelayBatch(updatedNonce);
        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(nextNonce).toBe(2);
      });

      it("reports each single's nonce and hash through onBatchSent", async () => {
        fetchCount.mockResolvedValue(2);
        mockBatchSend.estimateGas = conflictingEstimate();
        mockWait.mockResolvedValueOnce({ hash: "0xa" }).mockResolvedValueOnce({ hash: "0xb" });

        const updatedNonce = await callRelayBatch();

        expect(batchNonces(mockBatchSend, 0)).toEqual([0]);
        expect(batchNonces(mockBatchSend, 1)).toEqual([1]);
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.RELAY_BATCH, 1, "0xa");
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.RELAY_BATCH, 2, "0xb");
        expect(updatedNonce).toBe(2);
      });

      it("resumes at the failing nonce when the count changed while sending singles", async () => {
        fetchCount.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
        mockBatchSend.estimateGas = conflictingEstimate([1]);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0]);
        expect(updatedNonce).toBe(1);
      });

      it("skips a single whose transaction is mined and reverts while the count is unchanged", async () => {
        fetchCount.mockResolvedValue(1);
        mockWait.mockRejectedValue(minedRevert);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(fetchCount).toHaveBeenCalledTimes(2);
        expect(emitSpy).toHaveBeenCalledWith(
          BotEvents.MESSAGE_EXECUTION_FAILED,
          targetChainId,
          network,
          0,
          minedRevert
        );
        expect(updatedNonce).toBe(1);
      });

      it("resumes at a single whose transaction is mined and reverts after the count changed (stale proof)", async () => {
        fetchCount.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
        mockWait.mockRejectedValue(minedRevert);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(updatedNonce).toBe(0);
      });

      it("skips a single mined and reverted inside the one-by-one sends and relays the rest", async () => {
        fetchCount.mockResolvedValue(3);
        mockBatchSend.estimateGas = conflictingEstimate();
        mockWait
          .mockResolvedValueOnce({ hash: "0xa" })
          .mockRejectedValueOnce(minedRevert)
          .mockResolvedValueOnce({ hash: "0xc" });

        const updatedNonce = await callRelayBatch();

        expect([0, 1, 2].map((call) => batchNonces(mockBatchSend, call))).toEqual([[0], [1], [2]]);
        expect(emitSpy).toHaveBeenCalledWith(
          BotEvents.MESSAGE_EXECUTION_FAILED,
          targetChainId,
          network,
          1,
          minedRevert
        );
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.RELAY_BATCH, 1, "0xa");
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.RELAY_BATCH, 3, "0xc");
        expect(updatedNonce).toBe(3);
      });

      it("sends the messages one by one when the batch broadcast is rejected for its size", async () => {
        fetchCount.mockResolvedValue(3);
        const oversized = makeError("could not coalesce error", "UNKNOWN_ERROR", {
          error: { code: -32000, message: "oversized data: transaction size 140000, limit 131072" },
        });
        mockBatchSend.mockRejectedValueOnce(oversized);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(4);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2]);
        expect([1, 2, 3].map((call) => batchNonces(mockBatchSend, call))).toEqual([[0], [1], [2]]);
        expect(updatedNonce).toBe(3);
      });

      it("rethrows, and skips nothing, when another transaction with its nonce replaced the single and reverted", async () => {
        fetchCount.mockResolvedValue(1);
        const replaced = makeError("transaction was replaced", "TRANSACTION_REPLACED", {
          cancelled: true,
          reason: "replaced",
          hash: "0xother",
          replacement: {} as any,
          receipt: { status: 0 } as any,
        });
        mockWait.mockRejectedValue(replaced);

        await expect(callRelayBatch()).rejects.toHaveProperty("cause", replaced);
      });

      it("sends the messages one by one when the batch is mined and reverts", async () => {
        fetchCount.mockResolvedValue(3);
        mockWait.mockRejectedValueOnce(minedRevert);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(4);
        expect(batchNonces(mockBatchSend, 0)).toEqual([0, 1, 2]);
        expect(batchNonces(mockBatchSend, 1)).toEqual([0]);
        expect(batchNonces(mockBatchSend, 3)).toEqual([2]);
        expect(updatedNonce).toBe(3);
      });

      it("rethrows when the batch wait times out and sends no single", async () => {
        fetchCount.mockResolvedValue(3);
        mockWait.mockRejectedValue(waitTimeout);

        const result = callRelayBatch();

        await expect(result).rejects.toBeInstanceOf(ExecutionError);
        await expect(result).rejects.toHaveProperty("cause", waitTimeout);
        expect(mockBatchSend).toHaveBeenCalledTimes(1);
      });

      it("rethrows a transport error of the batch gas estimation that the first single hits too", async () => {
        fetchCount.mockResolvedValue(3);
        mockBatchSend.estimateGas = jest.fn().mockRejectedValue(T1);

        const result = callRelayBatch();

        await expect(result).rejects.toBeInstanceOf(ExecutionError);
        await expect(result).rejects.toHaveProperty("cause", T1);
        expect(mockBatchSend.estimateGas).toHaveBeenCalledTimes(2);
        expect(mockBatchSend).not.toHaveBeenCalled();
      });

      it("rethrows a transport error of a single", async () => {
        fetchCount.mockResolvedValue(2);
        mockBatchSend.estimateGas = jest
          .fn()
          .mockRejectedValueOnce(R1)
          .mockResolvedValueOnce(600000)
          .mockRejectedValueOnce(T1);

        await expect(callRelayBatch()).rejects.toBeInstanceOf(ExecutionError);
        expect(mockBatchSend).toHaveBeenCalledTimes(1);
      });

      it("applies the single rules to a failing batch of one message", async () => {
        fetchCount.mockResolvedValue(1);
        mockBatchSend.estimateGas = jest.fn().mockRejectedValue(R1);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend.estimateGas).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.MESSAGE_EXECUTION_FAILED, targetChainId, network, 0, R1);
        expect(updatedNonce).toBe(1);
      });

      it("honours the resume nonce of a full batch", async () => {
        fetchCount.mockResolvedValueOnce(15).mockResolvedValueOnce(16);
        mockBatchSend.estimateGas = conflictingEstimate([4]);

        const updatedNonce = await callRelayBatch();

        expect(mockBatchSend).toHaveBeenCalledTimes(4);
        expect(updatedNonce).toBe(4);
      });

      it("honours the resume nonce of a batch sent before a transport stop", async () => {
        fetchCount.mockResolvedValueOnce(7).mockResolvedValueOnce(8);
        veaOutboxMock.sendMessage.staticCall = failingAt(3, T1);
        mockBatchSend.estimateGas = conflictingEstimate([1]);

        const updatedNonce = await callRelayBatch();

        expect(updatedNonce).toBe(1);
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

      it("waits for 1 confirmation for at most 5 minutes", async () => {
        fetchCount.mockResolvedValue(1);
        await callRelayBatch();
        expect(mockWait).toHaveBeenCalledWith(1, 300000);
      });

      it("rejects with ExecutionError when the wait times out", async () => {
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

    it("leaves out the nonces the snapshot does not cover yet", async () => {
      noncesBySender = { [senderA]: [2, 5, 9] };
      deps.fetchCount.mockResolvedValue(6);

      const updatedNonce = await callRelayAllFrom(0);

      expect(deps.fetchProofAtCount.mock.calls.map((call) => call[1])).toEqual([2, 5]);
      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      expect(batchNonces(mockBatchSend, 0)).toEqual([2, 5]);
      expect(updatedNonce).toBe(6);
    });

    it("relays the senders' messages in ascending batches of at most 10", async () => {
      noncesBySender = { [senderA]: [1, 3, 5, 7, 9, 11], [senderB]: [2, 4, 6, 8, 10, 12] };

      const updatedNonce = await callRelayAllFrom(0);

      expect(mockBatchSend).toHaveBeenCalledTimes(2);
      expect(batchNonces(mockBatchSend, 0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(batchNonces(mockBatchSend, 1)).toEqual([11, 12]);
      expect(mockBatchSend.mock.calls[0][0]).toEqual(Array(10).fill(veaOutboxAddress));
      expect(updatedNonce).toBe(13);
    });

    it("relays a nonce listed for two senders once", async () => {
      noncesBySender = { [senderA]: [1, 2], [senderB]: [2, 3] };

      const updatedNonce = await callRelayAllFrom(0);

      expect(batchNonces(mockBatchSend, 0)).toEqual([1, 2, 3]);
      expect(updatedNonce).toBe(4);
    });

    it("skips a message whose staticCall reverts (R1) while the count is unchanged", async () => {
      noncesBySender = { [senderA]: [1, 2, 3] };
      veaOutboxMock.sendMessage.staticCall = failingAt(2, R1);

      const updatedNonce = await callRelayAllFrom(0);

      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      expect(batchNonces(mockBatchSend, 0)).toEqual([1, 3]);
      expect(emitSpy).toHaveBeenCalledWith(BotEvents.MESSAGE_EXECUTION_FAILED, chainId, network, 2, R1);
      expect(updatedNonce).toBe(4);
    });

    it("stops at a transport error (T2) and returns that message's nonce", async () => {
      noncesBySender = { [senderA]: [4, 9], [senderB]: [6] };
      deps.fetchCount.mockResolvedValue(10);
      veaOutboxMock.sendMessage.staticCall = failingAt(6, T2);

      const updatedNonce = await callRelayAllFrom(0);

      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      expect(batchNonces(mockBatchSend, 0)).toEqual([4]);
      expect(veaOutboxMock.sendMessage.staticCall.mock.calls.map((call: any[]) => call[1])).toEqual([4, 6]);
      expect(updatedNonce).toBe(6);
    });

    it("drops the current batch on an R3 revert with a changed count and returns its first nonce", async () => {
      noncesBySender = { [senderA]: [3, 5, 7, 8] };
      deps.fetchCount.mockResolvedValueOnce(10).mockResolvedValueOnce(11);
      veaOutboxMock.sendMessage.staticCall = failingAt(8, R3);

      const updatedNonce = await callRelayAllFrom(0, 2);

      expect(mockBatchSend).toHaveBeenCalledTimes(1);
      expect(batchNonces(mockBatchSend, 0)).toEqual([3, 5]);
      expect(updatedNonce).toBe(7);
    });

    it.each(MESSAGE_FAILURES)("skips a message failing with %s while the count is unchanged", async (id) => {
      noncesBySender = { [senderA]: [1, 2, 3] };
      veaOutboxMock.sendMessage.staticCall = failingAt(2, fixtures[id]);

      const updatedNonce = await callRelayAllFrom(0);

      expect(batchNonces(mockBatchSend, 0)).toEqual([1, 3]);
      expect(deps.fetchCount).toHaveBeenCalledTimes(2);
      expect(emitSpy).toHaveBeenCalledWith(BotEvents.MESSAGE_EXECUTION_FAILED, chainId, network, 2, fixtures[id]);
      expect(updatedNonce).toBe(4);
    });

    it.each(MESSAGE_FAILURES)(
      "drops the current batch on a message failing with %s when the count changed",
      async (id) => {
        noncesBySender = { [senderA]: [3, 5, 7, 8] };
        deps.fetchCount.mockResolvedValueOnce(10).mockResolvedValueOnce(11);
        veaOutboxMock.sendMessage.staticCall = failingAt(8, fixtures[id]);

        const updatedNonce = await callRelayAllFrom(0, 2);

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([3, 5]);
        expect(deps.fetchCount).toHaveBeenCalledTimes(2);
        expect(updatedNonce).toBe(7);
      }
    );

    it.each(TRANSPORT_FAILURES)(
      "stops at a %s transport or unknown failure with no retry, no count re-read and no skip",
      async (id) => {
        noncesBySender = { [senderA]: [4, 9], [senderB]: [6] };
        deps.fetchCount.mockResolvedValue(10);
        veaOutboxMock.sendMessage.staticCall = failingAt(6, fixtures[id]);

        const updatedNonce = await callRelayAllFrom(0);

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(batchNonces(mockBatchSend, 0)).toEqual([4]);
        expect(staticCallNonces(veaOutboxMock.sendMessage.staticCall)).toEqual([4, 6]);
        expect(veaOutboxMock.isMsgRelayed).toHaveBeenCalledTimes(2);
        expect(deps.fetchCount).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.MESSAGE_EXECUTION_FAILED, chainId, network, 6, fixtures[id]);
        expect(updatedNonce).toBe(6);
      }
    );

    describe("when the batch fails", () => {
      it("sends the messages one by one and skips the one that fails alone", async () => {
        noncesBySender = { [senderA]: [2, 5, 7] };
        mockBatchSend.estimateGas = conflictingEstimate([5]);

        const updatedNonce = await callRelayAllFrom(0);

        expect(mockBatchSend).toHaveBeenCalledTimes(2);
        expect(batchNonces(mockBatchSend, 0)).toEqual([2]);
        expect(batchNonces(mockBatchSend, 1)).toEqual([7]);
        expect(emitSpy).toHaveBeenCalledWith(BotEvents.MESSAGE_EXECUTION_FAILED, chainId, network, 5, R1);
        expect(updatedNonce).toBe(8);
      });

      it("resumes at the failing nonce when the count changed while sending singles", async () => {
        noncesBySender = { [senderA]: [2, 5, 7] };
        deps.fetchCount.mockResolvedValueOnce(20).mockResolvedValueOnce(21);
        mockBatchSend.estimateGas = conflictingEstimate([5]);

        const updatedNonce = await callRelayAllFrom(0);

        expect(mockBatchSend).toHaveBeenCalledTimes(1);
        expect(updatedNonce).toBe(5);
      });

      it("rethrows a transport error of the batch gas estimation that the first single hits too", async () => {
        noncesBySender = { [senderA]: [2, 5] };
        mockBatchSend.estimateGas = jest.fn().mockRejectedValue(T1);

        await expect(callRelayAllFrom(0)).rejects.toBeInstanceOf(ExecutionError);
        expect(mockBatchSend).not.toHaveBeenCalled();
      });
    });

    it("counts messages already relayed as handled", async () => {
      noncesBySender = { [senderA]: [3, 4] };
      veaOutboxMock.isMsgRelayed.mockResolvedValue(true);

      const updatedNonce = await callRelayAllFrom(2);

      expect(mockBatchSend).not.toHaveBeenCalled();
      expect(updatedNonce).toBe(5);
    });

    it("returns the input nonce when the count is 0", async () => {
      noncesBySender = { [senderA]: [5, 6] };
      deps.fetchCount.mockResolvedValue(0);

      const updatedNonce = await callRelayAllFrom(5);

      expect(updatedNonce).toBe(5);
      expect(deps.fetchNonceFrom).not.toHaveBeenCalled();
      expect(mockBatchSend).not.toHaveBeenCalled();
    });

    it("returns the input nonce when there are no candidates", async () => {
      noncesBySender = { [senderB]: [25] };

      const updatedNonce = await callRelayAllFrom(5);

      expect(updatedNonce).toBe(5);
      expect(updatedNonce).not.toBeNull();
      expect(mockBatchSend).not.toHaveBeenCalled();
    });

    it("waits for 1 confirmation for at most 5 minutes", async () => {
      noncesBySender = { [senderA]: [1] };
      await callRelayAllFrom(0);
      expect(mockWait).toHaveBeenCalledWith(1, 300000);
    });

    it("rejects with ExecutionError when the wait times out", async () => {
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

    it("waits for 1 confirmation for at most 5 minutes", async () => {
      await relay(1, 2, network, emitter, deps);
      expect(mockWait).toHaveBeenCalledWith(1, 300000);
    });

    it("rejects with ExecutionError when the wait times out", async () => {
      mockWait.mockRejectedValue(waitTimeout);
      await expect(relay(1, 2, network, emitter, deps)).rejects.toBeInstanceOf(ExecutionError);
    });
  });
});
