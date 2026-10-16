import { EventEmitter } from "node:events";
import { Interface } from "ethers";
import { BotEvents } from "./botEvents";
import { ExecutionError } from "./errors";
import {
  toExecuteMessage,
  runHashiExecutor,
  getDispatchedTxns,
  getAllMessageDispatchedLogs,
  getMessageStatus,
  executeBatchOnHashi,
  YaruExecutor,
} from "./hashi";
import { YaruAbi, thresholdViewAbi } from "./hashiHelpers/abi";
import { getHashiMsgId } from "./hashiHelpers/hashiMsgUtils";
import { HashiExecutionStatus, HashiMessage, HashiMessageExecutionVars } from "./hashiHelpers/hashiTypes";
import { readPendingMessages, updateHashiStateFile } from "./hashiHelpers/stateFile";
import { ALREADY_EXECUTED_DATA, fixtures, fromNodeError, nodeBodies, yaruStaticCall } from "../tests/revert/fixtures";
import { YAHO, dispatchedLog, dispatchedMessage, fakeFileSystem, logScanProvider } from "../tests/hashi/dispatchedLogs";

class MockEmitter extends EventEmitter {
  emit(event: string | symbol, ...args: any[]): boolean {
    // Prevent console logs for BotEvents during tests
    if (Object.values(BotEvents).includes(event as BotEvents)) {
      return true;
    }
    return super.emit(event, ...args);
  }
}

// Threshold-check failures the shared classifier ties to the message, and failures that take the transport action:
// transport failures, and the unknown failures no rule ties to the message
const THRESHOLD_MESSAGE_FAILURES = ["N1", "N4", "A3", "A4", "A5", "P6", "P9"] as const;
const UNKNOWN_FAILURES = ["U1", "U2", "U3", "U4", "P11"] as const;
const THRESHOLD_TRANSPORT_FAILURES = [
  ...(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "P12"] as const),
  ...UNKNOWN_FAILURES,
];

describe("hashi", () => {
  let mockEmitter = new MockEmitter();
  const sourceChainId = 0;
  const targetChainId = 1;
  const startBlockNumber = 12_000_000;
  const nowSec = Math.floor(Date.now() / 1000);
  const ONE_WEEK = 60 * 60 * 24 * 7;
  const mockHashiMessage1: HashiMessage = {
    nonce: 3,
    targetChainId: 1,
    threshold: 1,
    sender: "0xSender",
    receiver: "0xReceiver",
    data: "0xData",
    reporters: ["0xReporter1"],
    adapters: ["0xAdapter1", "0xAdapter2"],
  };
  const mockHashiMessage2: HashiMessage = {
    nonce: 5,
    targetChainId: 1,
    threshold: 1,
    sender: "0xSender",
    receiver: "0xReceiver",
    data: "0xData",
    reporters: ["0xReporter1"],
    adapters: ["0xAdapter1", "0xAdapter2"],
  };
  const mockDispatchedTxnData1: HashiMessageExecutionVars = {
    txHash: "0xTxHash",
    timestamp: 1000,
    blockNumber: 1234567,
    messageId: BigInt(1),
    message: mockHashiMessage1,
  };
  const mockDispatchedTxnData2: HashiMessageExecutionVars = {
    txHash: "0xTxHash2",
    timestamp: 1000,
    blockNumber: 1234568,
    messageId: BigInt(2),
    message: mockHashiMessage2,
  };
  const currentBlockNumber = 12345678;

  let fetchBridgeConfig: jest.Mock;
  let fetchAllMessageLogs: jest.Mock;
  let fetchStartBlockNumber: jest.Mock;
  let fetchPendingMessages: jest.Mock;
  let updateStateFile: jest.Mock;
  let mockWait: jest.Mock;
  let mockBatchSend: jest.Mock & { estimateGas?: jest.Mock };

  beforeEach(() => {
    fetchBridgeConfig = jest.fn().mockReturnValue({
      sourceChainId: 0,
      targetChainId: 1,
      targetRPC: "http://test.rpc",
      sourceRPC: "http://test.rpc",
      yahoAddress: "0xYAHO",
      yaruAddress: "0xYARU",
      hashiAddress: "0xHASHI",
    });
    fetchAllMessageLogs = jest.fn().mockResolvedValue({ txns: [], toBlock: currentBlockNumber });
    mockWait = jest.fn().mockResolvedValue("receipt");
    mockBatchSend = jest.fn().mockResolvedValue({ wait: mockWait });
    mockBatchSend.estimateGas = jest.fn().mockResolvedValue(600000);
    fetchStartBlockNumber = jest.fn().mockResolvedValue(startBlockNumber);
    fetchPendingMessages = jest.fn().mockResolvedValue([]);
    updateStateFile = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("toExecuteMessage", () => {
    it("should verify if the message is executable", async () => {
      const result = await toExecuteMessage({
        sourceChainId,
        hashiMessage: mockHashiMessage1,
        emitter: mockEmitter,
        hasThresholdMet: jest.fn().mockResolvedValue(HashiExecutionStatus.EXECUTABLE),
      });
      expect(result.executable).toBe(true);
      expect(result.hashiMessage).toBe(mockHashiMessage1);
      expect(result!.status).toBe(HashiExecutionStatus.EXECUTABLE);
      expect(result!.hashiMessage).toBe(mockHashiMessage1);
    });

    it("should return false executable status if is not executable", async () => {
      const result = await toExecuteMessage({
        sourceChainId,
        hashiMessage: mockHashiMessage1,
        emitter: mockEmitter,
        hasThresholdMet: jest.fn().mockResolvedValue(HashiExecutionStatus.THRESHOLD_NOT_MET),
      });
      expect(result.executable).toBe(false);
      expect(result?.status).toBe(HashiExecutionStatus.THRESHOLD_NOT_MET);
    });

    it("should return executed status if already executed", async () => {
      const result = await toExecuteMessage({
        sourceChainId,
        hashiMessage: mockHashiMessage1,
        emitter: mockEmitter,
        hasThresholdMet: jest.fn().mockResolvedValue(HashiExecutionStatus.EXECUTED),
      });
      expect(result.executable).toBe(false);
      expect(result.status).toBe(HashiExecutionStatus.EXECUTED);
    });

    it.each(["R1", "R2", "R3"] as const)(
      "should resolve null and emit HASHI_MESSAGE_FAILING when the threshold check reverts (%s)",
      async (id) => {
        const emitter = new MockEmitter();
        const emit = jest.spyOn(emitter, "emit");
        const result = await toExecuteMessage({
          sourceChainId,
          hashiMessage: mockHashiMessage1,
          emitter,
          hasThresholdMet: jest.fn().mockRejectedValue(fixtures[id]),
        });
        expect(result).toBeNull();
        expect(emit).toHaveBeenCalledWith(BotEvents.HASHI_MESSAGE_FAILING, "3", "0", "1", fixtures[id]);
      }
    );

    it.each(["A1", "A2"] as const)(
      "should resolve null and emit HASHI_MESSAGE_FAILING when the threshold check aborts in the VM (%s)",
      async (id) => {
        const emitter = new MockEmitter();
        const emit = jest.spyOn(emitter, "emit");
        const result = await toExecuteMessage({
          sourceChainId,
          hashiMessage: mockHashiMessage1,
          emitter,
          hasThresholdMet: jest.fn().mockRejectedValue(fixtures[id]),
        });
        expect(result).toBeNull();
        expect(emit).toHaveBeenCalledWith(BotEvents.HASHI_MESSAGE_FAILING, "3", "0", "1", fixtures[id]);
      }
    );

    describe("with getMessageStatus", () => {
      const bridgeConfig = {
        sourceChainId,
        targetChainId,
        sourceRPC: "http://test.rpc",
        targetRPC: "http://test.rpc",
        yahoAddress: YAHO,
        yaruAddress: "0x00000000000000000000000000000000000000b2",
        hashiAddress: "0x00000000000000000000000000000000000000b3",
      };
      const thresholdMet = new Interface(thresholdViewAbi).encodeFunctionResult("checkHashWithThresholdFromAdapters", [
        true,
      ]);
      const message = dispatchedMessage(9n, BigInt(targetChainId), 1) as HashiMessage;

      it("should resolve null when the threshold-check call itself reverts", async () => {
        const provider = { call: jest.fn().mockRejectedValueOnce(fixtures.R1) };
        const result = await toExecuteMessage({
          sourceChainId,
          hashiMessage: message,
          emitter: mockEmitter,
          hasThresholdMet: (s, m, e) => getMessageStatus(s, m, e, bridgeConfig, provider),
        });
        expect(result).toBeNull();
        expect(provider.call).toHaveBeenCalledTimes(1);
        expect(provider.call.mock.calls[0][0].to).toBe(bridgeConfig.hashiAddress);
      });

      it("should reject, and the cycle write no checkpoint, when the Yaru.executed read reverts (R1)", async () => {
        const provider = { call: jest.fn() };
        const hasThresholdMet = (s: number, m: HashiMessage, e: EventEmitter) =>
          getMessageStatus(s, m, e, bridgeConfig, provider);
        provider.call.mockResolvedValueOnce(thresholdMet).mockRejectedValueOnce(fixtures.R1);

        const rejection = toExecuteMessage({
          sourceChainId,
          hashiMessage: message,
          emitter: mockEmitter,
          hasThresholdMet,
        });

        await expect(rejection).rejects.toBeInstanceOf(ExecutionError);
        await expect(rejection).rejects.toMatchObject({ cause: fixtures.R1 });
        expect(provider.call.mock.calls[1][0].to).toBe(bridgeConfig.yaruAddress);

        provider.call.mockResolvedValueOnce(thresholdMet).mockRejectedValueOnce(fixtures.R1);
        const record: HashiMessageExecutionVars = { ...mockDispatchedTxnData1, message, timestamp: nowSec - 60 };
        await expect(
          runHashiExecutor({
            sourceChainId,
            targetChainId,
            network: "hashi",
            emitter: mockEmitter,
            fetchBridgeConfig,
            fetchAllMessageLogs: jest.fn().mockResolvedValue({ txns: [record], toBlock: currentBlockNumber }),
            isMessageExecutable: (args) => toExecuteMessage({ ...args, hasThresholdMet }),
            executeMsgsOnHashi: jest.fn(),
            fetchStartBlockNumber,
            fetchPendingMessages,
            updateStateFile,
          })
        ).rejects.toBeInstanceOf(ExecutionError);
        expect(updateStateFile).not.toHaveBeenCalled();
      });
    });
  });

  describe("runHashiExecutor", () => {
    let mockIsMessageExecutable: jest.Mock;
    let mockExecuteMsgsOnHashi: jest.Mock;

    const buildArgs = (overrides: Record<string, any> = {}) =>
      ({
        sourceChainId,
        targetChainId,
        network: "hashi",
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchAllMessageLogs,
        isMessageExecutable: mockIsMessageExecutable,
        executeMsgsOnHashi: mockExecuteMsgsOnHashi,
        fetchStartBlockNumber,
        fetchPendingMessages,
        updateStateFile,
        ...overrides,
      } as any);

    beforeEach(() => {
      mockIsMessageExecutable = jest.fn();
      mockExecuteMsgsOnHashi = jest.fn().mockResolvedValue(undefined);
    });

    it("should call fetchAllMessageLogs with the start block from the state file", async () => {
      await runHashiExecutor(buildArgs());

      expect(fetchStartBlockNumber).toHaveBeenCalledWith(sourceChainId, targetChainId, "hashi", mockEmitter);
      expect(fetchAllMessageLogs).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        "http://test.rpc",
        "0xYAHO",
        startBlockNumber,
        mockEmitter
      );
    });

    it("should return the updated blockNumber even if no messages are sent", async () => {
      const result = await runHashiExecutor(buildArgs());

      expect(result).toBe(currentBlockNumber);
      expect(mockExecuteMsgsOnHashi).not.toHaveBeenCalled();
      expect(updateStateFile).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        expect.any(Number),
        currentBlockNumber,
        [],
        "hashi",
        mockEmitter
      );
    });

    it("should return the updated blockNumber even if there are no executable messages", async () => {
      fetchAllMessageLogs = jest.fn().mockResolvedValue({
        txns: [mockDispatchedTxnData1, mockDispatchedTxnData2],
        toBlock: currentBlockNumber,
      });
      mockIsMessageExecutable
        .mockResolvedValueOnce({
          hashiMessage: mockHashiMessage1,
          executable: false,
          status: HashiExecutionStatus.EXECUTED,
        })
        .mockResolvedValueOnce({
          hashiMessage: mockHashiMessage2,
          executable: false,
          status: HashiExecutionStatus.EXECUTED,
        });

      const result = await runHashiExecutor(buildArgs({ fetchAllMessageLogs }));

      expect(result).toBe(currentBlockNumber);
      expect(mockExecuteMsgsOnHashi).not.toHaveBeenCalled();
    });

    it("should execute messages on Hashi if there are executable messages", async () => {
      fetchAllMessageLogs = jest.fn().mockResolvedValue({
        txns: [mockDispatchedTxnData1, mockDispatchedTxnData2],
        toBlock: currentBlockNumber,
      });
      mockIsMessageExecutable
        .mockResolvedValueOnce({
          hashiMessage: mockHashiMessage1,
          executable: true,
          status: HashiExecutionStatus.EXECUTABLE,
        })
        .mockResolvedValueOnce({
          hashiMessage: mockHashiMessage2,
          executable: true,
          status: HashiExecutionStatus.EXECUTABLE,
        });

      const result = await runHashiExecutor(buildArgs({ fetchAllMessageLogs }));

      expect(result).toBe(currentBlockNumber);
      expect(mockExecuteMsgsOnHashi).toHaveBeenCalledTimes(1);
      expect(mockExecuteMsgsOnHashi).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        [mockHashiMessage1, mockHashiMessage2],
        mockEmitter
      );
    });
    it("should skip messages destined for another chain", async () => {
      const wrongTargetTxn: HashiMessageExecutionVars = {
        ...mockDispatchedTxnData1,
        message: { ...mockHashiMessage1, targetChainId: 99 },
      };
      fetchAllMessageLogs = jest.fn().mockResolvedValue({
        txns: [wrongTargetTxn],
        toBlock: currentBlockNumber,
      });
      fetchPendingMessages = jest.fn().mockResolvedValue([wrongTargetTxn]);

      const result = await runHashiExecutor(buildArgs({ fetchAllMessageLogs, fetchPendingMessages }));

      expect(result).toBe(currentBlockNumber);
      expect(mockIsMessageExecutable).not.toHaveBeenCalled();
      expect(mockExecuteMsgsOnHashi).not.toHaveBeenCalled();
      expect(updateStateFile).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        expect.any(Number),
        currentBlockNumber,
        [],
        "hashi",
        mockEmitter
      );
    });

    it("should skip messages where isMessageExecutable returns null", async () => {
      fetchAllMessageLogs = jest.fn().mockResolvedValue({
        txns: [mockDispatchedTxnData1],
        toBlock: currentBlockNumber,
      });
      mockIsMessageExecutable.mockResolvedValueOnce(null);

      const result = await runHashiExecutor(buildArgs({ fetchAllMessageLogs }));

      expect(result).toBe(currentBlockNumber);
      expect(mockExecuteMsgsOnHashi).not.toHaveBeenCalled();
      expect(updateStateFile).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        expect.any(Number),
        currentBlockNumber,
        [],
        "hashi",
        mockEmitter
      );
    });

    it("should track THRESHOLD_NOT_MET messages within the max pending window", async () => {
      const recentTxn: HashiMessageExecutionVars = {
        ...mockDispatchedTxnData1,
        timestamp: nowSec - 60,
      };
      fetchAllMessageLogs = jest.fn().mockResolvedValue({ txns: [recentTxn], toBlock: currentBlockNumber });
      mockIsMessageExecutable.mockResolvedValueOnce({
        hashiMessage: mockHashiMessage1,
        executable: false,
        status: HashiExecutionStatus.THRESHOLD_NOT_MET,
      });

      const result = await runHashiExecutor(buildArgs({ fetchAllMessageLogs }));

      expect(result).toBe(currentBlockNumber);
      expect(mockExecuteMsgsOnHashi).not.toHaveBeenCalled();
      expect(updateStateFile).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        expect.any(Number),
        currentBlockNumber,
        [recentTxn],
        "hashi",
        mockEmitter
      );
    });

    it("should drop pending messages older than MAX_PENDING_TIME_SECONDS", async () => {
      const expiredTxn: HashiMessageExecutionVars = {
        ...mockDispatchedTxnData1,
        timestamp: nowSec - ONE_WEEK - 60,
      };
      fetchAllMessageLogs = jest.fn().mockResolvedValue({ txns: [expiredTxn], toBlock: currentBlockNumber });
      mockIsMessageExecutable.mockResolvedValueOnce({
        hashiMessage: mockHashiMessage1,
        executable: false,
        status: HashiExecutionStatus.THRESHOLD_NOT_MET,
      });

      const result = await runHashiExecutor(buildArgs({ fetchAllMessageLogs }));

      expect(result).toBe(currentBlockNumber);
      expect(updateStateFile).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        expect.any(Number),
        currentBlockNumber,
        [],
        "hashi",
        mockEmitter
      );
    });
    it("should also process local messages from the state file", async () => {
      const localPendingMsg: HashiMessageExecutionVars = {
        ...mockDispatchedTxnData2,
        timestamp: nowSec - 60,
      };
      fetchPendingMessages = jest.fn().mockResolvedValue([localPendingMsg]);
      mockIsMessageExecutable.mockResolvedValueOnce({
        hashiMessage: mockHashiMessage2,
        executable: true,
        status: HashiExecutionStatus.EXECUTABLE,
      });

      const result = await runHashiExecutor(buildArgs({ fetchPendingMessages }));

      expect(result).toBe(currentBlockNumber);
      expect(fetchPendingMessages).toHaveBeenCalledWith(sourceChainId, targetChainId, "hashi");
      expect(mockExecuteMsgsOnHashi).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        [mockHashiMessage2],
        mockEmitter
      );
    });

    it("should merge new and local pending messages in the state file update", async () => {
      const newPendingTxn: HashiMessageExecutionVars = {
        ...mockDispatchedTxnData1,
        timestamp: nowSec - 60,
      };
      const localPendingMsg: HashiMessageExecutionVars = {
        ...mockDispatchedTxnData2,
        timestamp: nowSec - 120,
      };
      fetchPendingMessages = jest.fn().mockResolvedValue([localPendingMsg]);
      fetchAllMessageLogs = jest.fn().mockResolvedValue({
        txns: [newPendingTxn],
        toBlock: currentBlockNumber,
      });
      mockIsMessageExecutable
        .mockResolvedValueOnce({
          hashiMessage: mockHashiMessage1,
          executable: false,
          status: HashiExecutionStatus.THRESHOLD_NOT_MET,
        })
        .mockResolvedValueOnce({
          hashiMessage: mockHashiMessage2,
          executable: false,
          status: HashiExecutionStatus.THRESHOLD_NOT_MET,
        });

      const result = await runHashiExecutor(buildArgs({ fetchAllMessageLogs, fetchPendingMessages }));

      expect(result).toBe(currentBlockNumber);
      expect(updateStateFile).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        expect.any(Number),
        currentBlockNumber,
        [newPendingTxn, localPendingMsg],
        "hashi",
        mockEmitter
      );
    });

    describe("with a messageId both scanned and saved", () => {
      const scanned: HashiMessageExecutionVars = { ...mockDispatchedTxnData1, timestamp: nowSec - 60 };
      const savedCopy: HashiMessageExecutionVars = {
        ...mockDispatchedTxnData1,
        txHash: "0xSavedCopy",
        message: { ...mockHashiMessage1 },
        timestamp: nowSec - 600,
      };
      const savedOther: HashiMessageExecutionVars = { ...mockDispatchedTxnData2, timestamp: nowSec - 120 };

      beforeEach(() => {
        fetchAllMessageLogs = jest.fn().mockResolvedValue({ txns: [scanned], toBlock: currentBlockNumber });
        fetchPendingMessages = jest.fn().mockResolvedValue([savedCopy, savedOther]);
      });

      it("should save one copy, scanned record first, when it is THRESHOLD_NOT_MET", async () => {
        mockIsMessageExecutable.mockImplementation(async ({ hashiMessage }) => ({
          hashiMessage,
          executable: false,
          status: HashiExecutionStatus.THRESHOLD_NOT_MET,
        }));

        await runHashiExecutor(buildArgs({ fetchAllMessageLogs, fetchPendingMessages }));

        expect(mockIsMessageExecutable.mock.calls.map(([args]) => args.hashiMessage)).toEqual([
          mockHashiMessage1,
          mockHashiMessage2,
        ]);
        expect(mockIsMessageExecutable.mock.calls[0][0].hashiMessage).toBe(scanned.message);
        expect(updateStateFile).toHaveBeenCalledWith(
          sourceChainId,
          targetChainId,
          expect.any(Number),
          currentBlockNumber,
          [scanned, savedOther],
          "hashi",
          mockEmitter
        );
      });

      it("should execute one copy when it is EXECUTABLE", async () => {
        mockIsMessageExecutable.mockImplementation(async ({ hashiMessage }) => ({
          hashiMessage,
          executable: true,
          status: HashiExecutionStatus.EXECUTABLE,
        }));

        await runHashiExecutor(buildArgs({ fetchAllMessageLogs, fetchPendingMessages }));

        expect(mockExecuteMsgsOnHashi).toHaveBeenCalledTimes(1);
        expect(mockExecuteMsgsOnHashi).toHaveBeenCalledWith(
          sourceChainId,
          targetChainId,
          [scanned.message, savedOther.message],
          mockEmitter
        );
      });
    });

    describe("with a message decoded from a real MessageDispatched log", () => {
      const FAKE_STATE_DIR = "/fake-hashi-state/";
      let savedStateDir: string | undefined;

      beforeEach(() => {
        savedStateDir = process.env.STATE_DIR;
        process.env.STATE_DIR = FAKE_STATE_DIR;
      });

      afterEach(() => {
        if (savedStateDir === undefined) {
          delete process.env.STATE_DIR;
        } else {
          process.env.STATE_DIR = savedStateDir;
        }
      });

      it.each([1, 2])(
        "should save and read back every field with %i reporter(s) and adapter(s), then classify it next cycle",
        async (bridges) => {
          const original = dispatchedMessage(9n, BigInt(targetChainId), bridges);
          const messageId = 0xabcdefn;
          const dispatchTs = nowSec - 60;
          const provider = logScanProvider(
            startBlockNumber + 10,
            [dispatchedLog(messageId, original, startBlockNumber + 3)],
            dispatchTs
          );
          const { txns, toBlock } = await getAllMessageDispatchedLogs(
            sourceChainId,
            targetChainId,
            "http://test.rpc",
            YAHO,
            startBlockNumber,
            mockEmitter,
            1_000,
            0,
            provider
          );
          expect(txns).toHaveLength(1);
          // A plain object with plain arrays, not an ethers Result
          expect(txns[0].message).toStrictEqual(original);

          const { fileSystem, store } = fakeFileSystem();
          const removeLock = jest.fn();
          await updateHashiStateFile(
            sourceChainId,
            targetChainId,
            nowSec,
            toBlock,
            txns,
            "hashi",
            mockEmitter,
            false,
            fileSystem,
            removeLock
          );
          expect([...store.keys()]).toEqual([`${FAKE_STATE_DIR}hashi_${sourceChainId}_${targetChainId}.json`]);
          expect(removeLock).toHaveBeenCalledWith("hashi", sourceChainId, targetChainId);

          const saved = await readPendingMessages(sourceChainId, targetChainId, "hashi", fileSystem);
          expect(saved).toStrictEqual([
            {
              txHash: txns[0].txHash,
              blockNumber: startBlockNumber + 3,
              messageId,
              message: original,
              timestamp: dispatchTs,
            },
          ]);
          expect(Array.isArray(saved[0].message.reporters)).toBe(true);
          expect(Array.isArray(saved[0].message.adapters)).toBe(true);

          mockIsMessageExecutable.mockImplementation(async ({ hashiMessage }) => ({
            hashiMessage,
            executable: false,
            status: HashiExecutionStatus.THRESHOLD_NOT_MET,
          }));
          await runHashiExecutor(
            buildArgs({
              fetchPendingMessages: (src: number, dst: number, network: string) =>
                readPendingMessages(src, dst, network, fileSystem),
            })
          );
          expect(mockIsMessageExecutable).toHaveBeenCalledTimes(1);
          expect(mockIsMessageExecutable.mock.calls[0][0].hashiMessage).toStrictEqual(original);
          expect(updateStateFile).toHaveBeenCalledWith(
            sourceChainId,
            targetChainId,
            expect.any(Number),
            currentBlockNumber,
            saved,
            "hashi",
            mockEmitter
          );
        }
      );
    });

    describe("with a failing Yaru preflight", () => {
      const envioShaped = (nonce: number): HashiMessage => ({
        ...dispatchedMessage(BigInt(nonce), BigInt(targetChainId), 1),
        nonce,
        targetChainId,
        threshold: 1,
      });
      const rpcShaped = (nonce: number): HashiMessage => dispatchedMessage(BigInt(nonce), BigInt(targetChainId), 1);
      const record = (id: bigint, message: HashiMessage, timestamp: number): HashiMessageExecutionVars => ({
        txHash: `0x${id.toString(16)}`,
        blockNumber: 100,
        messageId: id,
        message,
        timestamp,
      });

      // A Yaru whose per-message preflight fails with the error the callback returns for a nonce
      const fakeYaru = (preflightError: (nonce: bigint) => unknown) => {
        const send = jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue({ hash: "0xbatch" }) });
        const staticCall = jest.fn(async ([message]: { nonce: bigint }[]) => {
          const error = preflightError(message.nonce);
          if (error) throw error;
          return [];
        });
        const yaru = { executeMessages: Object.assign(send, { staticCall }) } as unknown as YaruExecutor;
        return { yaru, send, staticCall };
      };

      const runCycle = (records: HashiMessageExecutionVars[], yaru: YaruExecutor) => {
        mockIsMessageExecutable.mockImplementation(async ({ hashiMessage }) => ({
          hashiMessage,
          executable: true,
          status: HashiExecutionStatus.EXECUTABLE,
        }));
        return runHashiExecutor(
          buildArgs({
            fetchAllMessageLogs: jest.fn().mockResolvedValue({ txns: records, toBlock: currentBlockNumber }),
            executeMsgsOnHashi: (src: number, dst: number, params: HashiMessage[], emitter: EventEmitter) =>
              executeBatchOnHashi(src, dst, params, emitter, yaru),
          })
        );
      };
      const savedPending = () => updateStateFile.mock.calls[0][4];
      const sentNonces = (send: jest.Mock) => send.mock.calls.map(([messages]) => messages.map((m: any) => m.nonce));

      it.each([
        ["an Envio-shaped (number nonce)", envioShaped],
        ["an RPC-shaped (bigint nonce)", rpcShaped],
      ])("should keep %s message pending when the preflight fails with a transport error (T2)", async (_, shape) => {
        const kept = record(11n, shape(3), nowSec - 60);
        const { yaru, send } = fakeYaru(() => fixtures.T2);

        const result = await runCycle([kept], yaru);

        expect(result).toBe(currentBlockNumber);
        expect(send).not.toHaveBeenCalled();
        expect(savedPending()).toHaveLength(1);
        expect(savedPending()[0]).toBe(kept);
      });

      it("should keep a CallFailed message pending with its dispatch timestamp and out of the batch", async () => {
        const emitter = new MockEmitter();
        const emit = jest.spyOn(emitter, "emit");
        const callFailed = record(11n, rpcShaped(3), nowSec - 3600);
        const passing = record(12n, rpcShaped(4), nowSec - 60);
        const { yaru, send } = fakeYaru((nonce) => (nonce === 3n ? yaruStaticCall("R4") : undefined));

        await runHashiExecutor(
          buildArgs({
            emitter,
            fetchAllMessageLogs: jest
              .fn()
              .mockResolvedValue({ txns: [callFailed, passing], toBlock: currentBlockNumber }),
            isMessageExecutable: jest.fn(async ({ hashiMessage }) => ({
              hashiMessage,
              executable: true,
              status: HashiExecutionStatus.EXECUTABLE,
            })),
            executeMsgsOnHashi: (src: number, dst: number, params: HashiMessage[], e: EventEmitter) =>
              executeBatchOnHashi(src, dst, params, e, yaru),
          })
        );

        expect(sentNonces(send)).toEqual([[4n]]);
        expect(savedPending()).toEqual([callFailed]);
        expect(savedPending()[0]).toBe(callFailed);
        expect(savedPending()[0].timestamp).toBe(nowSec - 3600);
        expect(emit).toHaveBeenCalledWith(BotEvents.HASHI_MESSAGE_FAILING, "3", "0", "1", yaruStaticCall("R4"));
      });

      it("should drop a message whose preflight fails with MessageIdAlreadyExecuted", async () => {
        const alreadyExecuted = record(11n, rpcShaped(3), nowSec - 60);
        const { yaru, send } = fakeYaru(() => yaruStaticCall("R5"));

        await runCycle([alreadyExecuted], yaru);

        expect(send).not.toHaveBeenCalled();
        expect(savedPending()).toEqual([]);
      });

      it("should not keep a failed message dispatched more than one week ago", async () => {
        const expired = record(11n, rpcShaped(3), nowSec - ONE_WEEK - 60);
        const { yaru } = fakeYaru(() => yaruStaticCall("R4"));

        await runCycle([expired], yaru);

        expect(savedPending()).toEqual([]);
      });

      it("should send a message that passes the preflight and not keep it pending", async () => {
        const passing = record(12n, envioShaped(4), nowSec - 60);
        const { yaru, send, staticCall } = fakeYaru(() => undefined);

        await runCycle([passing], yaru);

        expect(staticCall).toHaveBeenCalledTimes(1);
        expect(sentNonces(send)).toEqual([[4n]]);
        expect(savedPending()).toEqual([]);
      });

      it("should keep pending a message whose preflight fails with CallFailed given only in info.error.data (N4)", async () => {
        const kept = record(11n, rpcShaped(3), nowSec - 60);
        const { yaru, send, staticCall } = fakeYaru(() => fixtures.N4);

        await runCycle([kept], yaru);

        expect((fixtures.N4 as any).data).toBeNull();
        expect(staticCall).toHaveBeenCalledTimes(1);
        expect(send).not.toHaveBeenCalled();
        expect(savedPending()).toEqual([kept]);
      });

      it("should drop a message whose preflight fails with MessageIdAlreadyExecuted given only in info.error.data", async () => {
        const alreadyExecuted = record(11n, rpcShaped(3), nowSec - 60);
        const error = fromNodeError({ ...nodeBodies.N4, data: ALREADY_EXECUTED_DATA });
        const { yaru, send } = fakeYaru(() => error);

        await runCycle([alreadyExecuted], yaru);

        expect((error as any).data).toBeNull();
        expect(send).not.toHaveBeenCalled();
        expect(savedPending()).toEqual([]);
      });

      it.each([...(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"] as const), ...UNKNOWN_FAILURES])(
        "should keep a message pending, with no probe, when the preflight fails with %s",
        async (id) => {
          const kept = record(11n, rpcShaped(3), nowSec - 60);
          const { yaru, send, staticCall } = fakeYaru(() => fixtures[id]);

          await runCycle([kept], yaru);

          expect(staticCall).toHaveBeenCalledTimes(1);
          expect(send).not.toHaveBeenCalled();
          expect(savedPending()).toEqual([kept]);
        }
      );

      it("should keep nothing pending when executeMsgsOnHashi resolves undefined", async () => {
        const executed = record(12n, rpcShaped(4), nowSec - 60);
        mockIsMessageExecutable.mockResolvedValueOnce({
          hashiMessage: executed.message,
          executable: true,
          status: HashiExecutionStatus.EXECUTABLE,
        });

        await runHashiExecutor(
          buildArgs({
            fetchAllMessageLogs: jest.fn().mockResolvedValue({ txns: [executed], toBlock: currentBlockNumber }),
          })
        );

        expect(mockExecuteMsgsOnHashi).toHaveBeenCalledTimes(1);
        expect(savedPending()).toEqual([]);
      });
    });

    describe("with a threshold check that fails", () => {
      it.each(THRESHOLD_TRANSPORT_FAILURES)(
        "should reject with the transport or unknown failure (%s) and write no checkpoint",
        async (id) => {
          const hasThresholdMet = jest.fn().mockRejectedValue(fixtures[id]);
          await expect(
            toExecuteMessage({ sourceChainId, hashiMessage: mockHashiMessage1, emitter: mockEmitter, hasThresholdMet })
          ).rejects.toBe(fixtures[id]);

          await expect(
            runHashiExecutor(
              buildArgs({
                fetchAllMessageLogs: jest
                  .fn()
                  .mockResolvedValue({ txns: [mockDispatchedTxnData1], toBlock: currentBlockNumber }),
                isMessageExecutable: (args: any) => toExecuteMessage({ ...args, hasThresholdMet }),
              })
            )
          ).rejects.toBe(fixtures[id]);
          // One threshold check per call: no retry
          expect(hasThresholdMet).toHaveBeenCalledTimes(2);
          expect(updateStateFile).not.toHaveBeenCalled();
        }
      );

      it.each(["R1", "A1"] as const)(
        "should skip the message whose threshold check fails (%s), execute the other and write the checkpoint",
        async (id) => {
          const skipped: HashiMessageExecutionVars = { ...mockDispatchedTxnData1, timestamp: nowSec - 60 };
          const executable: HashiMessageExecutionVars = { ...mockDispatchedTxnData2, timestamp: nowSec - 60 };
          const hasThresholdMet = jest.fn(async (_src: number, message: HashiMessage) => {
            if (message === skipped.message) throw fixtures[id];
            return HashiExecutionStatus.EXECUTABLE;
          });

          const result = await runHashiExecutor(
            buildArgs({
              fetchAllMessageLogs: jest
                .fn()
                .mockResolvedValue({ txns: [skipped, executable], toBlock: currentBlockNumber }),
              isMessageExecutable: (args: any) => toExecuteMessage({ ...args, hasThresholdMet }),
            })
          );

          expect(result).toBe(currentBlockNumber);
          expect(mockExecuteMsgsOnHashi).toHaveBeenCalledWith(
            sourceChainId,
            targetChainId,
            [executable.message],
            mockEmitter
          );
          expect(updateStateFile).toHaveBeenCalledWith(
            sourceChainId,
            targetChainId,
            expect.any(Number),
            currentBlockNumber,
            [],
            "hashi",
            mockEmitter
          );
        }
      );

      describe("through getMessageStatus on the target chain provider", () => {
        const bridgeConfig = {
          sourceChainId,
          targetChainId,
          sourceRPC: "http://test.rpc",
          targetRPC: "http://test.rpc",
          yahoAddress: YAHO,
          yaruAddress: "0x00000000000000000000000000000000000000b2",
          hashiAddress: "0x00000000000000000000000000000000000000b3",
        };
        const thresholdIface = new Interface(thresholdViewAbi);
        const thresholdMet = thresholdIface.encodeFunctionResult("checkHashWithThresholdFromAdapters", [true]);
        const notExecuted = new Interface(YaruAbi).encodeFunctionResult("executed", [false]);
        const failingMessage = dispatchedMessage(9n, BigInt(targetChainId), 1) as HashiMessage;
        const passingMessage = dispatchedMessage(10n, BigInt(targetChainId), 1) as HashiMessage;
        const thresholdCall = (message: HashiMessage) =>
          thresholdIface.encodeFunctionData("checkHashWithThresholdFromAdapters", [
            BigInt(sourceChainId),
            getHashiMsgId(sourceChainId, YAHO, message),
            BigInt(message.threshold),
            message.adapters,
          ]);
        const failingThresholdCall = thresholdCall(failingMessage);
        const record = (messageId: bigint, message: HashiMessage): HashiMessageExecutionVars => ({
          txHash: "0xTxHash",
          timestamp: nowSec - 60,
          blockNumber: 1234567,
          messageId,
          message,
        });

        // A target chain provider: the failing message's threshold check rejects with `thresholdFailure`, every other
        // threshold check passes, and no message is executed on Yaru yet
        const targetProvider = (thresholdFailure: Error) => ({
          call: jest.fn(async (tx: { to: string; data: string }) => {
            if (tx.data === failingThresholdCall) throw thresholdFailure;
            return tx.to === bridgeConfig.hashiAddress ? thresholdMet : notExecuted;
          }),
        });
        const callsWith = (provider: ReturnType<typeof targetProvider>, data: string) =>
          provider.call.mock.calls.filter(([tx]) => tx.data === data);

        const runCycle = (provider: ReturnType<typeof targetProvider>, emitter: EventEmitter) =>
          runHashiExecutor(
            buildArgs({
              emitter,
              fetchAllMessageLogs: jest.fn().mockResolvedValue({
                txns: [record(1n, failingMessage), record(2n, passingMessage)],
                toBlock: currentBlockNumber,
              }),
              isMessageExecutable: (args: any) =>
                toExecuteMessage({
                  ...args,
                  hasThresholdMet: (s, m, e) => getMessageStatus(s, m, e, bridgeConfig, provider),
                }),
            })
          );

        it.each(THRESHOLD_MESSAGE_FAILURES)(
          "should skip the message whose threshold check fails with %s, execute the other and write the checkpoint",
          async (id) => {
            const emitter = new MockEmitter();
            const emit = jest.spyOn(emitter, "emit");
            const provider = targetProvider(fixtures[id]);

            const result = await runCycle(provider, emitter);

            expect(result).toBe(currentBlockNumber);
            expect(emit).toHaveBeenCalledWith(BotEvents.HASHI_MESSAGE_FAILING, "9", "0", "1", fixtures[id]);
            expect(callsWith(provider, failingThresholdCall)).toHaveLength(1);
            expect(mockExecuteMsgsOnHashi).toHaveBeenCalledWith(
              sourceChainId,
              targetChainId,
              [passingMessage],
              emitter
            );
            expect(updateStateFile).toHaveBeenCalledWith(
              sourceChainId,
              targetChainId,
              expect.any(Number),
              currentBlockNumber,
              [],
              "hashi",
              emitter
            );
          }
        );

        it.each(THRESHOLD_TRANSPORT_FAILURES)(
          "should reject with the transport or unknown failure %s after one call, execute nothing and write no checkpoint",
          async (id) => {
            const provider = targetProvider(fixtures[id]);

            await expect(runCycle(provider, mockEmitter)).rejects.toBe(fixtures[id]);

            expect(provider.call).toHaveBeenCalledTimes(1);
            expect(mockExecuteMsgsOnHashi).not.toHaveBeenCalled();
            expect(updateStateFile).not.toHaveBeenCalled();
          }
        );
      });
    });
  });

  describe("getDispatchedTxns", () => {
    const yahoAddress = "0xYAHO";
    const providerRPC = "http://test.rpc";
    const fromBlock = startBlockNumber;
    const envioResult = { txns: [mockDispatchedTxnData1], toBlock: currentBlockNumber };
    const rpcResult = { txns: [mockDispatchedTxnData2], toBlock: currentBlockNumber };
    let fetchFromEnvio: jest.Mock;
    let fetchFromRPC: jest.Mock;

    beforeEach(() => {
      fetchFromEnvio = jest.fn().mockResolvedValue(envioResult);
      fetchFromRPC = jest.fn().mockResolvedValue(rpcResult);
    });

    afterEach(() => {
      delete process.env.RELAYER_ENVIO_YAHO;
    });

    it("should fetch from the envio indexer when RELAYER_ENVIO_YAHO is set", async () => {
      process.env.RELAYER_ENVIO_YAHO = "http://envio.test/v1/graphql";

      const result = await getDispatchedTxns(
        sourceChainId,
        targetChainId,
        providerRPC,
        yahoAddress,
        fromBlock,
        mockEmitter,
        fetchFromEnvio,
        fetchFromRPC
      );

      expect(result).toBe(envioResult);
      expect(fetchFromEnvio).toHaveBeenCalledWith(sourceChainId, targetChainId, yahoAddress, fromBlock, 10);
      expect(fetchFromRPC).not.toHaveBeenCalled();
    });

    it("should fall back to RPC scanning when the envio indexer fails", async () => {
      process.env.RELAYER_ENVIO_YAHO = "http://envio.test/v1/graphql";
      fetchFromEnvio.mockRejectedValue(new Error("connection refused"));

      const result = await getDispatchedTxns(
        sourceChainId,
        targetChainId,
        providerRPC,
        yahoAddress,
        fromBlock,
        mockEmitter,
        fetchFromEnvio,
        fetchFromRPC
      );

      expect(result).toBe(rpcResult);
      expect(fetchFromEnvio).toHaveBeenCalledTimes(1);
      expect(fetchFromRPC).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        providerRPC,
        yahoAddress,
        fromBlock,
        mockEmitter
      );
    });

    it("should use RPC scanning when RELAYER_ENVIO_YAHO is not set", async () => {
      const result = await getDispatchedTxns(
        sourceChainId,
        targetChainId,
        providerRPC,
        yahoAddress,
        fromBlock,
        mockEmitter,
        fetchFromEnvio,
        fetchFromRPC
      );

      expect(result).toBe(rpcResult);
      expect(fetchFromEnvio).not.toHaveBeenCalled();
      expect(fetchFromRPC).toHaveBeenCalledWith(
        sourceChainId,
        targetChainId,
        providerRPC,
        yahoAddress,
        fromBlock,
        mockEmitter
      );
    });
  });

  describe("getAllMessageDispatchedLogs", () => {
    const fromBlock = 5_000;
    const chunkSize = 1_000;
    const dispatchTs = nowSec - 60;
    // `count` route messages, one per block from `firstBlock`
    const routeLogs = (count: number, firstBlock: number) =>
      Array.from({ length: count }, (_, i) =>
        dispatchedLog(BigInt(1_000 + firstBlock + i), dispatchedMessage(BigInt(firstBlock + i), 1n, 1), firstBlock + i)
      );
    const scan = (provider: ReturnType<typeof logScanProvider>, start = fromBlock) =>
      getAllMessageDispatchedLogs(
        sourceChainId,
        targetChainId,
        "http://test.rpc",
        YAHO,
        start,
        mockEmitter,
        chunkSize,
        0,
        provider
      );
    const requestedRanges = (provider: ReturnType<typeof logScanProvider>) =>
      provider.getLogs.mock.calls.map(([filter]) => [filter.fromBlock, filter.toBlock]);

    it("should return the end of the last scanned chunk when it stops early at 10 messages, and request no later chunk", async () => {
      const logs = [...routeLogs(10, fromBlock + 1), ...routeLogs(3, fromBlock + chunkSize + 1)];
      const provider = logScanProvider(fromBlock + 5 * chunkSize, logs, dispatchTs);

      const { txns, toBlock } = await scan(provider);

      expect(txns).toHaveLength(10);
      expect(toBlock).toBe(fromBlock + chunkSize);
      expect(requestedRanges(provider)).toEqual([[fromBlock + 1, fromBlock + chunkSize]]);
    });

    it("should return the end of the second chunk when the 10th message is found there", async () => {
      const logs = [...routeLogs(6, fromBlock + 1), ...routeLogs(6, fromBlock + chunkSize + 1)];
      const provider = logScanProvider(fromBlock + 5 * chunkSize, logs, dispatchTs);

      const { txns, toBlock } = await scan(provider);

      expect(txns).toHaveLength(12);
      expect(toBlock).toBe(fromBlock + 2 * chunkSize);
      expect(provider.getLogs).toHaveBeenCalledTimes(2);
    });

    it("should return the planned end (the finalized head) when it finds fewer than 10 messages", async () => {
      const head = fromBlock + 2 * chunkSize + 500;
      const provider = logScanProvider(head, routeLogs(4, fromBlock + chunkSize + 1), dispatchTs);

      const { txns, toBlock } = await scan(provider);

      expect(txns).toHaveLength(4);
      expect(toBlock).toBe(head);
      expect(requestedRanges(provider)).toEqual([
        [fromBlock + 1, fromBlock + chunkSize],
        [fromBlock + chunkSize + 1, fromBlock + 2 * chunkSize],
        [fromBlock + 2 * chunkSize + 1, head],
      ]);
    });

    it("should return the planned end (the 1,000,000-block cap) when it finds fewer than 10 messages", async () => {
      const provider = logScanProvider(fromBlock + 3_000_000, routeLogs(2, fromBlock + 1), dispatchTs);

      const { txns, toBlock } = await getAllMessageDispatchedLogs(
        sourceChainId,
        targetChainId,
        "http://test.rpc",
        YAHO,
        fromBlock,
        mockEmitter,
        250_000,
        0,
        provider
      );

      expect(txns).toHaveLength(2);
      expect(toBlock).toBe(fromBlock + 1_000_000);
      expect(provider.getLogs).toHaveBeenCalledTimes(4);
    });

    it.each([0, -10])(
      "should return fromBlock unchanged without calling getLogs when the finalized head is at or below it (head %i)",
      async (offset) => {
        const provider = logScanProvider(fromBlock + offset, routeLogs(3, fromBlock - 5), dispatchTs);

        const { txns, toBlock } = await scan(provider);

        expect(txns).toEqual([]);
        expect(toBlock).toBe(fromBlock);
        expect(provider.getLogs).not.toHaveBeenCalled();
      }
    );

    it("should start the first getLogs range at fromBlock + 1", async () => {
      const atCheckpoint = routeLogs(1, fromBlock);
      const after = routeLogs(1, fromBlock + 1);
      const provider = logScanProvider(fromBlock + 100, [...atCheckpoint, ...after], dispatchTs);

      const { txns } = await scan(provider);

      expect(provider.getLogs.mock.calls[0][0].fromBlock).toBe(fromBlock + 1);
      expect(txns.map((tx) => tx.blockNumber)).toEqual([fromBlock + 1]);
    });

    it("should skip messages for another target chain and logs from another address", async () => {
      const otherTarget = dispatchedLog(77n, dispatchedMessage(77n, 99n, 1), fromBlock + 2);
      const otherAddress = { ...routeLogs(1, fromBlock + 3)[0], address: "0x00000000000000000000000000000000000000c3" };
      const provider = logScanProvider(
        fromBlock + 100,
        [otherTarget, otherAddress, ...routeLogs(1, fromBlock + 4)],
        dispatchTs
      );

      const { txns } = await scan(provider);

      expect(txns.map((tx) => tx.blockNumber)).toEqual([fromBlock + 4]);
      expect(txns[0].timestamp).toBe(dispatchTs);
    });
  });
});
