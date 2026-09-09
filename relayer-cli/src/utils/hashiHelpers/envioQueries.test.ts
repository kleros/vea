import request from "graphql-request";
import { getDispatchedMessagesFromEnvio, toHashiMessageExecutionVars, EnvioMessageDispatched } from "./envioQueries";

jest.mock("graphql-request", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockRequest = request as jest.MockedFunction<typeof request>;

const makeEnvioRow = (overrides: Partial<EnvioMessageDispatched> = {}): EnvioMessageDispatched => ({
  messageId: "12345",
  txHash: "0xTxHash",
  sourceChainId: "1514",
  yaho: "0xYAHO",
  nonce: "3",
  targetChainId: "42161",
  threshold: "2",
  sender: "0xSender",
  receiver: "0xReceiver",
  data: "0xData",
  reporters: JSON.stringify(["0xReporter1"]),
  adapters: JSON.stringify(["0xAdapter1", "0xAdapter2"]),
  blockNumber: "100",
  blockTimestamp: "1700000000",
  ...overrides,
});

describe("envioQueries", () => {
  const sourceChainId = 1514;
  const targetChainId = 42161;
  const yahoAddress = "0xYAHO";
  const fromBlock = 50;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RELAYER_ENVIO_YAHO = "http://envio.test/v1/graphql";
  });

  afterAll(() => {
    delete process.env.RELAYER_ENVIO_YAHO;
  });

  describe("toHashiMessageExecutionVars", () => {
    it("should map an Envio row to HashiMessageExecutionVars", () => {
      const mapped = toHashiMessageExecutionVars(makeEnvioRow());
      expect(mapped).toEqual({
        txHash: "0xTxHash",
        timestamp: 1700000000,
        blockNumber: 100,
        messageId: BigInt(12345),
        message: {
          nonce: 3,
          sender: "0xSender",
          targetChainId: 42161,
          receiver: "0xReceiver",
          threshold: 2,
          data: "0xData",
          reporters: ["0xReporter1"],
          adapters: ["0xAdapter1", "0xAdapter2"],
        },
      });
    });
  });

  describe("getDispatchedMessagesFromEnvio", () => {
    it("should throw MissingEnvironmentVariable when RELAYER_ENVIO_YAHO is not set", async () => {
      delete process.env.RELAYER_ENVIO_YAHO;
      await expect(
        getDispatchedMessagesFromEnvio(sourceChainId, targetChainId, yahoAddress, fromBlock)
      ).rejects.toThrow("Missing environment variable: RELAYER_ENVIO_YAHO");
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it("should query the indexer with the source chain, yaho address and fromBlock", async () => {
      mockRequest.mockResolvedValue({
        MessageDispatched: [],
        chain_metadata: [{ latest_processed_block: 200 }],
      });
      await getDispatchedMessagesFromEnvio(sourceChainId, targetChainId, yahoAddress, fromBlock);
      expect(mockRequest).toHaveBeenCalledWith("http://envio.test/v1/graphql", expect.any(String), {
        sourceChainId,
        targetChainId,
        chainId: sourceChainId,
        yaho: yahoAddress,
        fromBlock,
        limit: 10,
      });
    });

    it("should checkpoint the indexer head when the batch is not full", async () => {
      mockRequest.mockResolvedValue({
        MessageDispatched: [makeEnvioRow()],
        chain_metadata: [{ latest_processed_block: 200 }],
      });
      const { txns, toBlock } = await getDispatchedMessagesFromEnvio(
        sourceChainId,
        targetChainId,
        yahoAddress,
        fromBlock
      );
      expect(txns).toHaveLength(1);
      expect(txns[0].message.nonce).toBe(3);
      expect(toBlock).toBe(200);
    });

    it("should checkpoint the last fetched message when the batch is full", async () => {
      const rows = Array.from({ length: 10 }, (_, i) =>
        makeEnvioRow({ nonce: String(i), blockNumber: String(100 + i) })
      );
      mockRequest.mockResolvedValue({
        MessageDispatched: rows,
        chain_metadata: [{ latest_processed_block: 500 }],
      });
      const { txns, toBlock } = await getDispatchedMessagesFromEnvio(
        sourceChainId,
        targetChainId,
        yahoAddress,
        fromBlock
      );
      expect(txns).toHaveLength(10);
      expect(toBlock).toBe(109);
    });

    it("should not move the checkpoint backwards when the indexer head lags fromBlock", async () => {
      mockRequest.mockResolvedValue({
        MessageDispatched: [],
        chain_metadata: [{ latest_processed_block: 40 }],
      });
      const { txns, toBlock } = await getDispatchedMessagesFromEnvio(
        sourceChainId,
        targetChainId,
        yahoAddress,
        fromBlock
      );
      expect(txns).toHaveLength(0);
      expect(toBlock).toBe(fromBlock);
    });

    it("should checkpoint the last fetched message when chain metadata is missing", async () => {
      mockRequest.mockResolvedValue({
        MessageDispatched: [makeEnvioRow({ blockNumber: "120" })],
        chain_metadata: [],
      });
      const { toBlock } = await getDispatchedMessagesFromEnvio(sourceChainId, targetChainId, yahoAddress, fromBlock);
      expect(toBlock).toBe(120);
    });

    it("should keep fromBlock when there are no messages and no chain metadata", async () => {
      mockRequest.mockResolvedValue({
        MessageDispatched: [],
        chain_metadata: [],
      });
      const { txns, toBlock } = await getDispatchedMessagesFromEnvio(
        sourceChainId,
        targetChainId,
        yahoAddress,
        fromBlock
      );
      expect(txns).toHaveLength(0);
      expect(toBlock).toBe(fromBlock);
    });

    it("should wrap indexer failures in DataError", async () => {
      mockRequest.mockRejectedValue(new Error("connection refused"));
      await expect(
        getDispatchedMessagesFromEnvio(sourceChainId, targetChainId, yahoAddress, fromBlock)
      ).rejects.toMatchObject({
        name: "DataError",
        message: "Data error for call: Failed to fetch dispatched messages (envio), Chain ID: 1514, Network: hashi",
      });
    });
  });
});
