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
    // Drop queued mockResolvedValueOnce answers a failed test left unused
    mockRequest.mockReset();
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

    it("should not query the boundary block when the batch is not full", async () => {
      mockRequest.mockResolvedValue({
        MessageDispatched: [makeEnvioRow({ blockNumber: "100" })],
        chain_metadata: [{ latest_processed_block: 200 }],
      });
      await getDispatchedMessagesFromEnvio(sourceChainId, targetChainId, yahoAddress, fromBlock);
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    describe("with a full batch", () => {
      const row = (nonce: number, blockNumber: number) =>
        makeEnvioRow({ messageId: String(1000 + nonce), nonce: String(nonce), blockNumber: String(blockNumber) });
      const fullBatch = (rows: EnvioMessageDispatched[]) => ({
        MessageDispatched: rows,
        chain_metadata: [{ latest_processed_block: 500 }],
      });
      const blockQueryVars = (blockNumber: number, offset: number) => ({
        sourceChainId,
        targetChainId,
        yaho: yahoAddress,
        blockNumber,
        limit: 100,
        offset,
      });

      it("should take every message of the last block and checkpoint that block", async () => {
        // Rows 0-9 in blocks 100-109; block 109 also holds nonces 10 and 11, beyond the limit
        const rows = Array.from({ length: 10 }, (_, i) => row(i, 100 + i));
        mockRequest
          .mockResolvedValueOnce(fullBatch(rows))
          .mockResolvedValueOnce({ MessageDispatched: [row(9, 109), row(10, 109), row(11, 109)] })
          .mockResolvedValueOnce({ MessageDispatched: [] });

        const { txns, toBlock } = await getDispatchedMessagesFromEnvio(
          sourceChainId,
          targetChainId,
          yahoAddress,
          fromBlock
        );

        expect(toBlock).toBe(109);
        expect(txns.map((txn) => txn.message.nonce)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        expect(mockRequest).toHaveBeenCalledTimes(3);
        expect(mockRequest).toHaveBeenNthCalledWith(
          2,
          "http://envio.test/v1/graphql",
          expect.stringContaining("blockNumber: { _eq: $blockNumber }"),
          blockQueryVars(109, 0)
        );
        expect(mockRequest).toHaveBeenNthCalledWith(3, expect.any(String), expect.any(String), blockQueryVars(109, 3));
      });

      it("should take the whole block when every message of the batch shares one block", async () => {
        const rows = Array.from({ length: 10 }, (_, i) => row(i, 105));
        const block = Array.from({ length: 12 }, (_, i) => row(i, 105));
        mockRequest
          .mockResolvedValueOnce(fullBatch(rows))
          .mockResolvedValueOnce({ MessageDispatched: block })
          .mockResolvedValueOnce({ MessageDispatched: [] });

        const { txns, toBlock } = await getDispatchedMessagesFromEnvio(
          sourceChainId,
          targetChainId,
          yahoAddress,
          fromBlock
        );

        expect(toBlock).toBe(105);
        expect(txns.map((txn) => txn.message.nonce)).toEqual(block.map((_, i) => i));
      });

      it("should read the boundary block page by page until an empty page", async () => {
        const rows = Array.from({ length: 10 }, (_, i) => row(i, 105));
        const firstPage = Array.from({ length: 100 }, (_, i) => row(i, 105));
        const lastPage = Array.from({ length: 5 }, (_, i) => row(100 + i, 105));
        mockRequest
          .mockResolvedValueOnce(fullBatch(rows))
          .mockResolvedValueOnce({ MessageDispatched: firstPage })
          .mockResolvedValueOnce({ MessageDispatched: lastPage })
          .mockResolvedValueOnce({ MessageDispatched: [] });

        const { txns, toBlock } = await getDispatchedMessagesFromEnvio(
          sourceChainId,
          targetChainId,
          yahoAddress,
          fromBlock
        );

        expect(toBlock).toBe(105);
        expect(txns).toHaveLength(105);
        expect(mockRequest).toHaveBeenCalledTimes(4);
        expect(mockRequest).toHaveBeenNthCalledWith(2, expect.any(String), expect.any(String), blockQueryVars(105, 0));
        expect(mockRequest).toHaveBeenNthCalledWith(
          3,
          expect.any(String),
          expect.any(String),
          blockQueryVars(105, 100)
        );
        expect(mockRequest).toHaveBeenNthCalledWith(
          4,
          expect.any(String),
          expect.any(String),
          blockQueryVars(105, 105)
        );
      });

      it("should keep reading when the server caps a page below the page size", async () => {
        // A server row cap of 40: two short pages still precede the end of the block
        const rows = Array.from({ length: 10 }, (_, i) => row(i, 105));
        mockRequest
          .mockResolvedValueOnce(fullBatch(rows))
          .mockResolvedValueOnce({ MessageDispatched: Array.from({ length: 40 }, (_, i) => row(i, 105)) })
          .mockResolvedValueOnce({ MessageDispatched: Array.from({ length: 40 }, (_, i) => row(40 + i, 105)) })
          .mockResolvedValueOnce({ MessageDispatched: [] });

        const { txns, toBlock } = await getDispatchedMessagesFromEnvio(
          sourceChainId,
          targetChainId,
          yahoAddress,
          fromBlock
        );

        expect(toBlock).toBe(105);
        expect(txns.map((txn) => txn.message.nonce)).toEqual(Array.from({ length: 80 }, (_, i) => i));
        expect(mockRequest).toHaveBeenNthCalledWith(3, expect.any(String), expect.any(String), blockQueryVars(105, 40));
        expect(mockRequest).toHaveBeenNthCalledWith(4, expect.any(String), expect.any(String), blockQueryVars(105, 80));
      });

      it("should wrap a boundary block query failure in DataError", async () => {
        const rows = Array.from({ length: 10 }, (_, i) => row(i, 100 + i));
        mockRequest.mockResolvedValueOnce(fullBatch(rows)).mockRejectedValueOnce(new Error("connection refused"));

        await expect(
          getDispatchedMessagesFromEnvio(sourceChainId, targetChainId, yahoAddress, fromBlock)
        ).rejects.toMatchObject({ name: "DataError" });
      });
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
