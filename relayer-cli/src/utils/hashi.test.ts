import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";
import { toExecuteMessage, runHashiExecutor } from "./hashi";
import {
  HashiMessageState,
  HashiExecutionStatus,
  HashiMessage,
  DispatchedTxnData,
  HashiMessageExecutionVars,
} from "./hashiHelpers/hashiTypes";
class MockEmitter extends EventEmitter {
  emit(event: string | symbol, ...args: any[]): boolean {
    // Prevent console logs for BotEvents during tests
    if (Object.values(BotEvents).includes(event as BotEvents)) {
      return true;
    }
    return super.emit(event, ...args);
  }
}

class MockJsonRpcProvider {
  private mockBlockNumber: number;
  constructor(private endBlock: number) {
    this.mockBlockNumber = endBlock;
  }
  async getBlockNumber(): Promise<number> {
    return this.mockBlockNumber;
  }
  async getLogs(): Promise<any[]> {
    return []; // Or return mocked logs
  }
}

describe("hashi", () => {
  let mockEmitter = new MockEmitter();
  const sourceChainId = 0;
  const targetChainId = 1;
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
    blockNumber: 1234567,
    messageId: BigInt(1),
    message: mockHashiMessage1,
  };
  const mockDispatchedTxnData2: HashiMessageExecutionVars = {
    txHash: "0xTxHash2",
    blockNumber: 1234568,
    messageId: BigInt(2),
    message: mockHashiMessage2,
  };
  const currentBlockNumber = 12345678;

  let fetchBridgeConfig: jest.Mock;
  let fetchAllMessageLogs: jest.Mock;

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("toExecuteMessage", () => {
    it("should verify if the message is executable", async () => {
      const result = await toExecuteMessage({
        sourceChainId,
        hashiMessage: mockHashiMessage1,
        hasThresholdMet: jest.fn().mockResolvedValue(HashiExecutionStatus.EXECUTABLE),
      });
      expect(result.executable).toBe(true);
      expect(result.hashiMessage).toBe(mockHashiMessage1);
    });
    it("should return null if is not executable", async () => {
      const result = await toExecuteMessage({
        sourceChainId,
        hashiMessage: mockHashiMessage1,
        hasThresholdMet: jest.fn().mockResolvedValue(HashiExecutionStatus.THRESHOLD_NOT_MET),
      });
      expect(result).toBeNull();
    });
    it("should return executed status if already executed", async () => {
      const result = await toExecuteMessage({
        sourceChainId,
        hashiMessage: mockHashiMessage1,
        hasThresholdMet: jest.fn().mockResolvedValue(HashiExecutionStatus.EXECUTED),
      });
      expect(result.executable).toBe(false);
      expect(result.status).toBe(HashiExecutionStatus.EXECUTED);
    });
  });

  describe("runHashiExecutor", () => {
    let mocktoExecuteMessage: jest.Mock;
    let mockExecuteMessage: jest.Mock;
    beforeEach(() => {
      mocktoExecuteMessage = jest.fn();
      mockExecuteMessage = jest.fn();
    });

    it("should return the updated blockNumber even if no messages are sent", async () => {
      fetchAllMessageLogs = jest.fn().mockResolvedValue({ txns: [], toBlock: currentBlockNumber });
      const result = await runHashiExecutor({
        sourceChainId,
        targetChainId,
        blockNumber: 0,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchAllMessageLogs,
        isMessageExecutable: mocktoExecuteMessage,
        executeMsgsOnHashi: mockExecuteMessage,
      } as any);
      expect(result).toBeDefined();
      expect(result).toBe(currentBlockNumber);
    });

    it("should return the updated blockNumber even if there are no executable messages", async () => {
      const messages: HashiMessageState[] = [];
      messages.push({
        hashiMessage: mockHashiMessage1,
        executable: false,
        status: HashiExecutionStatus.EXECUTED,
      });
      messages.push({
        hashiMessage: mockHashiMessage2,
        executable: false,
        status: HashiExecutionStatus.EXECUTED,
      });
      mocktoExecuteMessage.mockResolvedValueOnce(messages[0]).mockResolvedValueOnce(messages[1]);

      const result = await runHashiExecutor({
        sourceChainId,
        targetChainId,
        blockNumber: 0,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchAllMessageLogs,
        isMessageExecutable: mocktoExecuteMessage,
        executeMsgsOnHashi: mockExecuteMessage,
      } as any);
      expect(result).toBeDefined();
      expect(mockExecuteMessage).not.toHaveBeenCalled();
      expect(result).toBe(currentBlockNumber);
    });

    it("should execute messages on Hashi if there are executable messages", async () => {
      const mockHashiTxns: DispatchedTxnData = { txns: [], toBlock: currentBlockNumber };
      mockHashiTxns.txns.push(mockDispatchedTxnData1);
      mockHashiTxns.txns.push(mockDispatchedTxnData2);
      fetchAllMessageLogs = jest.fn().mockResolvedValue({ txns: mockHashiTxns.txns, toBlock: currentBlockNumber });
      const messages: HashiMessageState[] = [];
      messages.push({
        hashiMessage: mockHashiMessage1,
        executable: true,
        status: HashiExecutionStatus.EXECUTABLE,
      });
      messages.push({
        hashiMessage: mockHashiMessage2,
        executable: true,
        status: HashiExecutionStatus.EXECUTABLE,
      });
      mocktoExecuteMessage.mockResolvedValueOnce(messages[0]).mockResolvedValueOnce(messages[1]);

      const result = await runHashiExecutor({
        sourceChainId,
        targetChainId,
        blockNumber: 0,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchAllMessageLogs,
        isMessageExecutable: mocktoExecuteMessage,
        executeMsgsOnHashi: mockExecuteMessage,
      } as any);
      expect(result).toBeDefined();
      expect(mockExecuteMessage).toHaveBeenCalledWith(sourceChainId, targetChainId, messages, mockEmitter);
      expect(result).toBe(currentBlockNumber);
    });
  });
});
