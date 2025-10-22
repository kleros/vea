import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";
import { toExecuteMesssage, runHashiExecutor } from "./hashi";
import { VeaNonceToHashiMessage, HashiExecutionStatus, HashiMessage } from "./hashiHelpers/hashiTypes";

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
  const veaOutboxAddress = "0x123";
  const currentCount = 3;
  const network = "testing" as any;
  const chainId = 1;
  const nonce = 0;

  let fetchBridgeConfig: jest.Mock;
  let fetchCount: jest.Mock;
  let fetchVeaInbox: jest.Mock;
  let fetchBatcher: jest.Mock;
  let fetchVeaMsgTrnx: jest.Mock;
  let provider: jest.Mock;
  let logIFace: jest.Mock;

  let mockWait: jest.Mock;
  let mockBatchSend: jest.Mock & { estimateGas?: jest.Mock };

  let veaOutboxMock: any;

  beforeEach(() => {
    fetchBridgeConfig = jest.fn().mockReturnValue({
      batcherAddress: veaOutboxAddress,
      yahoAddress: "0xYaho",
      veaContracts: {
        [network]: {
          veaInbox: { address: "0xInbox", abi: ["dummyInboxAbi"] },
          veaOutbox: { address: veaOutboxAddress, abi: ["dummyOutboxAbi"] },
        },
      },
      rpcOutbox: "https://rpc.example.com",
    });

    fetchCount = jest.fn().mockResolvedValue(currentCount);

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

    fetchVeaInbox = jest.fn().mockReturnValue({
      count: fetchCount,
    });
    fetchVeaMsgTrnx = jest.fn().mockResolvedValue(["0x123"]);

    mockWait = jest.fn().mockResolvedValue("receipt");
    mockBatchSend = jest.fn().mockResolvedValue({ wait: mockWait });

    mockBatchSend.estimateGas = jest.fn().mockResolvedValue(600000);

    fetchBatcher = jest.fn().mockReturnValue({
      batchSend: mockBatchSend,
    });

    provider = {
      getTransactionReceipt: jest.fn().mockResolvedValue({ logs: [{ address: "0xYaho" }] }),
    } as any;

    logIFace = {
      decodeEventLog: jest.fn().mockReturnValue({
        message: [
          BigInt(1), //hashi nonce
          BigInt(2), // targetChainId
          BigInt(3), // threshold
          "0xSender", // sender
          "0xReceiver", // receiver
          "0xData", // data
          ["0xReporter1"], // reporters
          ["0xAdapter1", "0xAdapter2"], // adapters
        ],
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  describe("toExecuteMessage", () => {
    it("should verify if the vea message is executed using Hashi and is executable", async () => {
      const result = await toExecuteMesssage({
        chainId,
        nonce,
        veaInboxAddress: "0xInbox",
        rpcInbox: "https://rpc.inbox.example.com",
        fetchVeaMsgTrnx,
        fetchBridgeConfig,
        hasThresholdMet: jest.fn().mockResolvedValue(HashiExecutionStatus.EXECUTABLE),
        provider: provider as any,
        logIFace: logIFace as any,
      });
      expect(result).not.toBeNull();
      expect(result?.nonce).toBe(nonce);
      expect(result?.hashiMessage.nonce).toBe(BigInt(1));
    });
    it("should return null if the vea message is not executable via Hashi", async () => {
      const result = await toExecuteMesssage({
        chainId,
        nonce,
        veaInboxAddress: "0xInbox",
        rpcInbox: "https://rpc.inbox.example.com",
        fetchVeaMsgTrnx,
        fetchBridgeConfig,
        hasThresholdMet: jest.fn().mockResolvedValue(false),
        provider: provider as any,
        logIFace: logIFace as any,
      });
      expect(result).toBeNull();
    });
    it("should return null if there is no Hashi message in the logs", async () => {
      const providerNoLogs = {
        getTransactionReceipt: jest.fn().mockResolvedValue({ logs: [] }),
      } as any;

      const result = await toExecuteMesssage({
        chainId,
        nonce,
        veaInboxAddress: "0xInbox",
        rpcInbox: "https://rpc.inbox.example.com",
        fetchVeaMsgTrnx,
        fetchBridgeConfig,
        hasThresholdMet: jest.fn(),
        provider: providerNoLogs as any,
        logIFace: logIFace as any,
      });
      expect(result).toBeNull();
    });
  });

  describe("runHashiExecutor", () => {
    let mockToExecuteMesssage: jest.Mock;
    let mockExecuteMessage: jest.Mock;
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
    beforeEach(() => {
      mockToExecuteMesssage = jest.fn();
      mockExecuteMessage = jest.fn();
    });

    it("should not increment nonce if no messages are executable", async () => {
      mockToExecuteMesssage.mockResolvedValue(null);

      const result = await runHashiExecutor({
        chainId,
        network,
        nonce,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchVeaInbox,
        isMessageExecutable: mockToExecuteMesssage,
        executeMsgsOnHashi: mockExecuteMessage,
      });
      expect(result).toBeDefined();
      expect(result).toBe(nonce);
    });

    it("should execute messages on Hashi if there are executable messages", async () => {
      const executableNonces: VeaNonceToHashiMessage[] = [];
      executableNonces.push({
        nonce: 1,
        hashiMessage: mockHashiMessage1,
        executed: false,
      });
      executableNonces.push({
        nonce: 2,
        hashiMessage: mockHashiMessage2,
        executed: false,
      });
      mockToExecuteMesssage
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(executableNonces[0])
        .mockResolvedValueOnce(executableNonces[1]);

      mockExecuteMessage.mockResolvedValueOnce(currentCount);

      const result = await runHashiExecutor({
        chainId,
        network,
        nonce,
        emitter: mockEmitter,
        fetchBridgeConfig,
        fetchVeaInbox,
        isMessageExecutable: mockToExecuteMesssage,
        executeMsgsOnHashi: mockExecuteMessage,
      });
      expect(result).toBeDefined();
      expect(mockExecuteMessage).toHaveBeenCalledWith(chainId, executableNonces);
      expect(result).toBe(currentCount);
    });
  });
});
