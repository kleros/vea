import request from "graphql-request";
import { getNonceFrom } from "./graphQueries";
import { DataError } from "./errors";

jest.mock("graphql-request", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockRequest = request as jest.MockedFunction<typeof request>;

const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ nonce: String(from + i) }));
const page = (from: number, count: number) => ({ MessageSent: rows(from, count) });
const queryOf = (call: number) => String(mockRequest.mock.calls[call][1]);
const offsets = () => mockRequest.mock.calls.map((_, i) => Number(/offset: (\d+)/.exec(queryOf(i))?.[1]));

describe("getNonceFrom", () => {
  const inbox = "0xInbox";
  const sender = "0xAbCdEf0000000000000000000000000000000001";

  beforeEach(() => {
    jest.clearAllMocks();
    // Drop queued mockResolvedValueOnce answers a failed test left unused
    mockRequest.mockReset();
    process.env.ENVIO_URL = "http://envio.test/v1/graphql";
  });

  afterAll(() => {
    delete process.env.ENVIO_URL;
  });

  it("reads every page until an empty one", async () => {
    mockRequest
      .mockResolvedValueOnce(page(5, 1000))
      .mockResolvedValueOnce(page(1005, 1000))
      .mockResolvedValueOnce(page(2005, 250))
      .mockResolvedValueOnce(page(0, 0));

    const nonces = await getNonceFrom(1, inbox, 5, sender, "mainnet");

    expect(nonces).toHaveLength(2250);
    expect(nonces[0]).toBe(5);
    expect(nonces[2249]).toBe(2254);
    expect(nonces).toEqual(Array.from({ length: 2250 }, (_, i) => 5 + i));
    expect(offsets()).toEqual([0, 1000, 2000, 2250]);
  });

  it("keeps reading past short non-empty pages when the server caps the page size", async () => {
    mockRequest
      .mockResolvedValueOnce(page(0, 100))
      .mockResolvedValueOnce(page(100, 100))
      .mockResolvedValueOnce(page(200, 30))
      .mockResolvedValueOnce(page(0, 0));

    const nonces = await getNonceFrom(1, inbox, 0, sender, "mainnet");

    expect(nonces).toEqual(Array.from({ length: 230 }, (_, i) => i));
    expect(offsets()).toEqual([0, 100, 200, 230]);
  });

  it("returns an empty list for an empty first page", async () => {
    mockRequest.mockResolvedValueOnce(page(0, 0));

    await expect(getNonceFrom(1, inbox, 7, sender, "mainnet")).resolves.toEqual([]);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("filters by inbox, nonce, lowercased sender, and orders by nonce ascending in pages of 1000", async () => {
    mockRequest.mockResolvedValueOnce(page(0, 0));

    await getNonceFrom(1, inbox, 42, sender, "mainnet");

    expect(mockRequest.mock.calls[0][0]).toBe("http://envio.test/v1/graphql");
    const query = queryOf(0);
    expect(query).toContain("limit: 1000");
    expect(query).toContain("offset: 0");
    expect(query).toContain("nonce: { _gte: 42 }");
    expect(query).toContain(`inbox: { id: { _eq: "${inbox}" } }`);
    expect(query).toContain(`msgSender: { id: { _eq: "${sender.toLowerCase()}" } }`);
    expect(query).toContain("order_by: { nonce: asc }");
  });

  it("wraps a request failure in a DataError", async () => {
    const cause = new Error("boom");
    mockRequest.mockRejectedValueOnce(cause);

    const err = await getNonceFrom(1, inbox, 0, sender, "mainnet").catch((e) => e);

    expect(err).toBeInstanceOf(DataError);
    expect(err.message).toContain("Failed to fetch nonce(subgraph)");
    expect(err.cause).toBe(cause);
  });

  it("wraps a failure on a later page too, without returning partial results", async () => {
    mockRequest.mockResolvedValueOnce(page(0, 1000)).mockRejectedValueOnce(new Error("boom"));

    await expect(getNonceFrom(1, inbox, 0, sender, "mainnet")).rejects.toBeInstanceOf(DataError);
  });
});
