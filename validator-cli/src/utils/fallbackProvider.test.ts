import { EventEmitter } from "node:events";
import { FallbackRpcProvider, redactUrl, redactUrlsInText } from "./fallbackProvider";
import { FallbackProviderV5 } from "./fallbackProviderV5";
import { BotEvents } from "./botEvents";

// The logger builds a pino transport at import; keep the test off worker threads.
jest.mock("pino", () => {
  const fake: any = () => ({ child: () => ({ debug() {}, info() {}, warn() {}, error() {} }) });
  return { __esModule: true, default: fake };
});
import { configurableInitialize } from "./logger";

// Keys in the userinfo, the path and the query: every place an RPC provider puts one.
const KEY = "a1b2c3d4e5f6SECRETKEY";
const PRIMARY = `https://user:${KEY}@primary.example:8545/v3/${KEY}?apikey=${KEY}`;
const BACKUP = `https://backup.example/rpc/${KEY}?token=${KEY}`;

const capture = (emitter: EventEmitter, event: string): any[] => {
  const seen: any[] = [];
  emitter.on(event, (payload) => seen.push(payload));
  return seen;
};

/** An error as ethers builds one: the request URL in the message and in `info`. */
const ethersLikeError = (url: string) =>
  Object.assign(new Error(`server response 401 Unauthorized (request={  }, info={ "requestUrl": "${url}" })`), {
    code: "SERVER_ERROR",
    info: { requestUrl: url },
    url,
  });

describe("RPC URL redaction", () => {
  describe("redactUrl", () => {
    it("keeps only scheme://host, dropping userinfo, path and query", () => {
      expect(redactUrl(PRIMARY)).toBe("https://primary.example:8545");
      expect(redactUrl(BACKUP)).toBe("https://backup.example");
    });

    it("never echoes a value it cannot parse", () => {
      expect(redactUrl(`primary.example/v3/${KEY}`)).not.toContain(KEY);
    });

    it("redacts every URL embedded in free text", () => {
      const text = redactUrlsInText(`failed (url="${PRIMARY}") then ${BACKUP}, giving up`);
      expect(text).not.toContain(KEY);
      expect(text).toContain("https://primary.example:8545");
      expect(text).toContain("https://backup.example");
    });
  });

  it("FallbackRpcProvider logs RPC_FAILURE and RPC_RECOVERED with scheme://host only", async () => {
    const emitter = new EventEmitter();
    const failures = capture(emitter, BotEvents.RPC_FAILURE);
    const recoveries = capture(emitter, BotEvents.RPC_RECOVERED);
    const provider: any = new FallbackRpcProvider([PRIMARY, BACKUP], emitter, 11155111);
    provider.inner[0] = { _send: jest.fn(async () => Promise.reject(ethersLikeError(PRIMARY))) };
    provider.inner[1] = { _send: jest.fn(async (payload: any) => [{ id: payload.id, result: "0x10" }]) };

    await provider._send({ id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] });

    expect(failures).toHaveLength(1);
    expect(recoveries).toHaveLength(1);
    expect(JSON.stringify([failures, recoveries])).not.toContain(KEY);
    expect(failures[0].from).toBe("https://primary.example:8545");
    expect(failures[0].err.message).toContain("https://primary.example:8545");
    expect(recoveries[0]).toMatchObject({ from: "https://primary.example:8545", to: "https://backup.example" });
  });

  it("FallbackProviderV5 logs RPC_FAILURE and RPC_RECOVERED with scheme://host only", async () => {
    const emitter = new EventEmitter();
    const failures = capture(emitter, BotEvents.RPC_FAILURE);
    const recoveries = capture(emitter, BotEvents.RPC_RECOVERED);
    const provider: any = new FallbackProviderV5([PRIMARY, BACKUP], emitter);
    provider.inner[0] = { send: jest.fn(async () => Promise.reject(ethersLikeError(PRIMARY))) };
    provider.inner[1] = { send: jest.fn(async () => "0x10") };

    await provider.send("eth_blockNumber", []);

    expect(JSON.stringify([failures, recoveries])).not.toContain(KEY);
    expect(failures[0]).toMatchObject({ from: "https://primary.example:8545", to: "https://primary.example:8545" });
    expect(recoveries[0]).toMatchObject({ from: "https://primary.example:8545", to: "https://backup.example" });
  });

  it("FallbackProviderV5 rethrows a reverted call without failing over or logging RPC_FAILURE", async () => {
    // ethers v5 throws the JSON-RPC error as `err.error`, the raw response in `err.body`.
    const reverted = (rpcError: { code: number; message: string }) =>
      Object.assign(ethersLikeError(PRIMARY), {
        error: Object.assign(new Error(rpcError.message), { code: rpcError.code }),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, error: rpcError }),
      });

    for (const rpcError of [
      { code: 3, message: "execution reverted" },
      { code: -32000, message: "execution reverted" },
    ]) {
      const emitter = new EventEmitter();
      const failures = capture(emitter, BotEvents.RPC_FAILURE);
      const provider: any = new FallbackProviderV5([PRIMARY, BACKUP], emitter);
      const err = reverted(rpcError);
      provider.inner[0] = { send: jest.fn(async () => Promise.reject(err)) };
      provider.inner[1] = { send: jest.fn(async () => "0x10") };

      await expect(provider.send("eth_call", [])).rejects.toBe(err);

      expect(failures).toHaveLength(0);
      expect(provider.inner[1].send).not.toHaveBeenCalled();
    }
  });

  it("a rate-limited endpoint gives up after a couple of attempts so the next one is used (v6 and v5)", async () => {
    const http = await import("node:http");
    const serve = (handler: (body: any) => [number, any]) =>
      new Promise<{ url: string; hits: () => number; close: () => void }>((resolve) => {
        let hits = 0;
        const server = http.createServer((req, res) => {
          let raw = "";
          req.on("data", (chunk) => (raw += chunk));
          req.on("end", () => {
            hits++;
            const body = JSON.parse(raw);
            const [status, result] = handler(body);
            res.writeHead(status, { "content-type": "application/json" });
            const reply = (b: any) => ({ jsonrpc: "2.0", id: b.id, result });
            res.end(JSON.stringify(Array.isArray(body) ? body.map(reply) : reply(body)));
          });
        });
        server.listen(0, "127.0.0.1", () => {
          const { port } = server.address() as any;
          resolve({ url: `http://127.0.0.1:${port}`, hits: () => hits, close: () => server.close() });
        });
      });
    const throttled = await serve(() => [429, null]);
    const healthy = await serve(() => [200, "0x10"]);
    try {
      const v6: any = new FallbackRpcProvider([throttled.url, healthy.url], new EventEmitter(), 11155111);
      await v6._send({ id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] });
      expect(throttled.hits()).toBeLessThanOrEqual(3); // ethers default: 12, backing off for minutes

      const before = throttled.hits();
      const v5 = new FallbackProviderV5([throttled.url, healthy.url], new EventEmitter());
      expect(await v5.send("eth_blockNumber", [])).toBe("0x10");
      expect(throttled.hits() - before).toBeLessThanOrEqual(3);
    } finally {
      throttled.close();
      healthy.close();
    }
  });

  describe("logger", () => {
    const sinkAndEmitter = () => {
      const sink = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const emitter = new EventEmitter();
      configurableInitialize(emitter, sink);
      return { sink, emitter };
    };

    it("scrubs a raw URL and a raw ethers error out of RPC_FAILURE / RPC_RECOVERED", () => {
      const { sink, emitter } = sinkAndEmitter();

      emitter.emit(BotEvents.RPC_FAILURE, {
        method: "eth_call",
        from: PRIMARY,
        to: BACKUP,
        err: ethersLikeError(BACKUP),
      });
      emitter.emit(BotEvents.RPC_RECOVERED, { method: "eth_call", from: PRIMARY, to: BACKUP });

      const logged = JSON.stringify([sink.error.mock.calls, sink.info.mock.calls]);
      expect(sink.error).toHaveBeenCalledWith(
        expect.objectContaining({ from: "https://primary.example:8545" }),
        "rpc_failure"
      );
      expect(sink.info).toHaveBeenCalledWith(
        expect.objectContaining({ to: "https://backup.example" }),
        "rpc_recovered"
      );
      expect(logged).not.toContain(KEY);
    });

    it("scrubs URLs out of every other payload, e.g. an epoch failure caused by an RPC error", () => {
      const { sink, emitter } = sinkAndEmitter();

      emitter.emit(BotEvents.EPOCH_FAILED, {
        chainId: 11155111,
        network: "testnet",
        epoch: 7,
        message: ethersLikeError(PRIMARY).message,
      });
      emitter.emit(BotEvents.HEARTBEAT_FAILED, { status: "running", message: `GET ${BACKUP} timed out` });
      emitter.emit(BotEvents.ENV_WARNING, `endpoint ${PRIMARY} slow`);

      expect(JSON.stringify([sink.error.mock.calls, sink.warn.mock.calls])).not.toContain(KEY);
    });
  });
});

describe("log levels", () => {
  it("logs EPOCH_NOT_SETTLED and FINALITY_ISSUE at warn", () => {
    const sink = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const emitter = new EventEmitter();
    configurableInitialize(emitter, sink);

    emitter.emit(BotEvents.EPOCH_NOT_SETTLED, 5, 100, 200);
    emitter.emit(BotEvents.FINALITY_ISSUE, 5);

    const warned = sink.warn.mock.calls.map((call) => call[1]);
    expect(warned).toEqual(["epoch_not_settled", "finality_issue"]);
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.error).not.toHaveBeenCalled();
  });
});
