import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";
import { toExecuteMessage, runHashiExecutor } from "./hashi";
import { HashiExecutionStatus, HashiMessage, HashiMessageExecutionVars } from "./hashiHelpers/hashiTypes";

class MockEmitter extends EventEmitter {
  emit(event: string | symbol, ...args: any[]): boolean {
    // Prevent console logs for BotEvents during tests
    if (Object.values(BotEvents).includes(event as BotEvents)) {
      return true;
    }
    return super.emit(event, ...args);
  }
}

describe("hashi", () => {
  let mockEmitter = new MockEmitter();
  const sourceChainId = 0;
  const targetChainId = 1;
  const startBlockNumber = 12_000_000;
  const nowSec = Math.floor(Date.now() / 1000);
  const ONE_WEEK = 60 * 60 * 24 * 7;
  const mockHashiMessage1: HashiMessage = {
    nonce: 3,
    targetChainId: 2,
    threshold: 1,
    sender: "0xSender",
    receiver: "0xReceiver",
    data: "0xData",
    reporters: ["0xReporter1"],
    adapters: ["0xAdapter1", "0xAdapter2"],
  };
  const mockHashiMessage2: HashiMessage = {
    nonce: 5,
    targetChainId: 2,
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
  });
});
