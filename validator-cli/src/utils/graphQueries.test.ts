import http from "node:http";
import { AddressInfo } from "node:net";
import {
  INDEXER_TIMEOUT_MS,
  getClaimForEpoch,
  getClaimsForEpochs,
  getLastClaimedEpoch,
  getVerificationForClaim,
  getChallengerForClaim,
  getSnapshotSentForEpoch,
  getLastSnapshotSaved,
  getClaimedEpochsBelow,
  getIndexedBlock,
} from "./graphQueries";

const OUTBOX = "0x" + "ab".repeat(20);
const INBOX = "0x" + "cd".repeat(20);
// The bound the tests shorten INDEXER_TIMEOUT_MS to, and how long a query may take to give up.
const SHORT_TIMEOUT_MS = 200;
const GIVE_UP_DEADLINE_MS = 5_000;

jest.setTimeout(30_000);

/** A local HTTP server for the indexer; `respond` answers each request (or never does). */
const startIndexer = async (respond: (body: any, res: http.ServerResponse) => void) => {
  const requests: any[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push(body);
      respond(body, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/graphql`;
  const stop = async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  return { url, requests, stop };
};

const savedEnv = process.env.ENVIO_URL;
afterAll(() => {
  process.env.ENVIO_URL = savedEnv;
});

describe("graphQueries: every indexer request is bounded", () => {
  let indexer: Awaited<ReturnType<typeof startIndexer>>;
  // Called once the indexer has read a request (it never answers one).
  let onRequest = () => {};
  beforeAll(async () => {
    // Accepts the connection and reads the query, then never answers.
    indexer = await startIndexer(() => onRequest());
    process.env.ENVIO_URL = indexer.url;
  });
  afterAll(() => indexer.stop());
  beforeEach(() => {
    // The functions that swallow an indexer error print it; keep the test output readable.
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    onRequest = () => {};
  });

  const queries: Array<[string, () => Promise<unknown>]> = [
    ["getClaimForEpoch", () => getClaimForEpoch(7, OUTBOX, 10200)],
    ["getClaimsForEpochs", () => getClaimsForEpochs([7, 8], OUTBOX, 10200)],
    ["getLastClaimedEpoch", () => getLastClaimedEpoch(OUTBOX, 10200)],
    ["getVerificationForClaim", () => getVerificationForClaim("claim-1", 10200)],
    ["getChallengerForClaim", () => getChallengerForClaim("claim-1", 10200)],
    ["getSnapshotSentForEpoch", () => getSnapshotSentForEpoch(7, INBOX, 10200)],
    ["getLastSnapshotSaved", () => getLastSnapshotSaved(INBOX, 10200)],
    ["getClaimedEpochsBelow", () => getClaimedEpochsBelow(OUTBOX, 100, 10200)],
    ["getIndexedBlock", () => getIndexedBlock(10200)],
  ];

  it.each(queries)("%s gives up on an indexer that accepts the request and never answers", async (_name, query) => {
    // The real bound is 30 s, and the spy proves every request asks for INDEXER_TIMEOUT_MS. Its
    // signal fires once the indexer has read the request, not on a timer that a loaded machine
    // can run before the request even arrives; a real timeout backs it up.
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const seen = new AbortController();
    onRequest = () => seen.abort();
    const bounded = jest.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const backstop = timeout(GIVE_UP_DEADLINE_MS);
      backstop.addEventListener("abort", () => seen.abort(backstop.reason));
      return seen.signal;
    });
    const received = indexer.requests.length;
    let deadline: NodeJS.Timeout | undefined;
    const hung = new Promise((resolve) => (deadline = setTimeout(() => resolve("hung"), 2 * GIVE_UP_DEADLINE_MS)));
    const settled = query().then(
      () => "settled",
      () => "settled"
    );
    try {
      expect(await Promise.race([settled, hung])).toBe("settled");
    } finally {
      clearTimeout(deadline);
    }
    expect(indexer.requests.length).toBeGreaterThan(received);
    expect(bounded).toHaveBeenCalledWith(INDEXER_TIMEOUT_MS);
  });

  it("a request the indexer never answers rejects with an abort, not a hang", async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    jest.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(SHORT_TIMEOUT_MS));
    // getClaimForEpoch rethrows as ClaimNotFoundError; the printed cause is the abort.
    await expect(getClaimForEpoch(7, OUTBOX, 10200)).rejects.toThrow();
    const cause = (console.log as jest.Mock).mock.calls[0][0];
    expect(cause.name).toBe("AbortError");
  });

  it("bounds a request at 30 s", () => {
    expect(INDEXER_TIMEOUT_MS).toBe(30_000);
  });
});

describe("graphQueries: getClaimedEpochsBelow", () => {
  /**
   * Answers `Claim` queries the way the indexer does: rows of the outbox in the where clause with
   * `_gt < epoch < _lt`, ordered by epoch, at most `limit` of them. Epochs come back as strings,
   * as a BigInt field may.
   */
  const claimsIndexer = (claims: Array<{ outbox: string; epoch: number }>) =>
    startIndexer(({ query }, res) => {
      const outbox = /outbox: \{id: \{_eq: "([^"]+)"\}\}/.exec(query)![1];
      const after = Number(/_gt: (-?\d+)/.exec(query)![1]);
      const below = Number(/_lt: (\d+)/.exec(query)![1]);
      const limit = Number(/limit: (\d+)/.exec(query)![1]);
      const rows = claims
        .filter((claim) => claim.outbox === outbox && claim.epoch > after && claim.epoch < below)
        .sort((a, b) => a.epoch - b.epoch)
        .slice(0, limit)
        .map((claim) => ({ epoch: String(claim.epoch) }));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: { Claim: rows } }));
    });

  let indexer: Awaited<ReturnType<typeof startIndexer>> | undefined;
  afterEach(async () => {
    await indexer?.stop();
    indexer = undefined;
  });

  it("pages every claimed epoch of the outbox below the bound, oldest first and each once", async () => {
    const claims = [
      ...Array.from({ length: 2600 }, (_, epoch) => ({ outbox: OUTBOX, epoch })),
      // A re-claimed epoch has two Claim rows; one sits on the first page boundary.
      ...[5, 999, 1000, 1999].map((epoch) => ({ outbox: OUTBOX, epoch })),
      // Another outbox's claims are not this one's.
      { outbox: INBOX, epoch: 3 },
    ];
    indexer = await claimsIndexer(claims);
    process.env.ENVIO_URL = indexer.url;

    const epochs = await getClaimedEpochsBelow(OUTBOX, 2500, 10200);

    expect(epochs).toEqual(Array.from({ length: 2500 }, (_, epoch) => epoch));
    // 2504 rows below 2500: three pages of at most 1000, each after the last epoch of the one before.
    expect(indexer.requests).toHaveLength(3);
    for (const { query } of indexer.requests) {
      expect(query).toContain("limit: 1000");
      expect(query).toContain("order_by: {epoch: asc}");
      expect(query).toContain(`outbox: {id: {_eq: "${OUTBOX}"}}`);
    }
  });

  it("returns no epochs, after one request, for an outbox with no older claim", async () => {
    indexer = await claimsIndexer([{ outbox: OUTBOX, epoch: 50 }]);
    process.env.ENVIO_URL = indexer.url;
    await expect(getClaimedEpochsBelow(OUTBOX, 50, 10200)).resolves.toEqual([]);
    expect(indexer.requests).toHaveLength(1);
  });

  it.each([
    ["a GraphQL error", (res: http.ServerResponse) => res.end(JSON.stringify({ errors: [{ message: "boom" }] }))],
    [
      "an HTTP error",
      (res: http.ServerResponse) => {
        res.statusCode = 500;
        res.end("down");
      },
    ],
  ])("throws on %s rather than returning a partial list", async (_name, fail) => {
    indexer = await startIndexer((_body, res) => {
      res.setHeader("content-type", "application/json");
      fail(res);
    });
    process.env.ENVIO_URL = indexer.url;
    await expect(getClaimedEpochsBelow(OUTBOX, 50, 10200)).rejects.toThrow();
  });

  it("throws when a full page does not move past the one before, rather than fetching it forever", async () => {
    // An indexer that ignores the `_gt` cursor and serves the first page again and again.
    indexer = await startIndexer((_body, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: { Claim: Array.from({ length: 1000 }, () => ({ epoch: "7" })) } }));
    });
    process.env.ENVIO_URL = indexer.url;
    await expect(getClaimedEpochsBelow(OUTBOX, 50, 10200)).rejects.toThrow(/did not page past/);
    expect(indexer.requests.length).toBeLessThanOrEqual(2);
  });
});

describe("graphQueries: getIndexedBlock", () => {
  let indexer: Awaited<ReturnType<typeof startIndexer>> | undefined;
  afterEach(async () => {
    await indexer?.stop();
    indexer = undefined;
  });
  const answering = async (data: any) => {
    indexer = await startIndexer((_body, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data }));
    });
    process.env.ENVIO_URL = indexer.url;
  };

  it("returns the last block the indexer processed on the chain", async () => {
    await answering({ chain_metadata: [{ latest_processed_block: 17_900_123 }] });
    await expect(getIndexedBlock(10200)).resolves.toBe(17_900_123);
    expect(indexer!.requests[0].query).toContain("chain_metadata(where: {chain_id: {_eq: 10200}})");
  });

  it.each([
    ["no row for the chain", []],
    ["no block processed", [{ latest_processed_block: null }]],
    ["envio's -1 before it starts", [{ latest_processed_block: -1 }]],
  ])("returns undefined for %s", async (_name, rows) => {
    await answering({ chain_metadata: rows });
    await expect(getIndexedBlock(10200)).resolves.toBeUndefined();
  });
});

describe("graphQueries: getLastSnapshotSaved", () => {
  let indexer: Awaited<ReturnType<typeof startIndexer>> | undefined;
  afterEach(async () => {
    await indexer?.stop();
    indexer = undefined;
  });
  const answering = async (data: any) => {
    indexer = await startIndexer((_body, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data }));
    });
    process.env.ENVIO_URL = indexer.url;
  };

  it("returns the inbox's highest saved count (the inbox count it saved, as a BigInt string) and its root", async () => {
    const stateRoot = "0x" + "44".repeat(32);
    await answering({ SnapshotSaved: [{ count: "5", stateRoot }] });
    await expect(getLastSnapshotSaved(INBOX, 10200)).resolves.toEqual({ count: 5, stateRoot });
    const { query } = indexer!.requests[0];
    expect(query).toContain("SnapshotSaved(limit:1");
    expect(query).toContain("order_by:[{count:desc}, {blockNumber:desc}]");
    expect(query).toContain(`inbox:{id:{_eq:"${INBOX}"}}`);
  });

  it("returns null for an inbox with no save", async () => {
    await answering({ SnapshotSaved: [] });
    await expect(getLastSnapshotSaved(INBOX, 10200)).resolves.toBeNull();
  });

  it("throws on an answer that is not a count", async () => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    await answering({ SnapshotSaved: [{ count: "lots", stateRoot: "0x" }] });
    await expect(getLastSnapshotSaved(INBOX, 10200)).rejects.toThrow();
    jest.restoreAllMocks();
  });
});
