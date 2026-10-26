import { EventEmitter } from "node:events";
import { FetchRequest } from "ethers";
import {
  FallbackRpcProvider,
  RATE_LIMITED_ATTEMPTS_WITH_FALLBACK,
  redactUrl,
  redactUrlsInText,
} from "./fallbackProvider";
import { FallbackProviderV5 } from "./fallbackProviderV5";
import { BotEvents } from "./botEvents";
import { signedSend } from "../testUtils/signedSends";

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

  describe("FallbackRpcProvider on JSON-RPC error responses", () => {
    // ethers v6 throws only on transport failures: an HTTP 200 whose body is a JSON-RPC error
    // comes back from the inner `_send` as an ordinary element, `{ id, error }`.
    const TARGET = "0x00000000000000000000000000000000000000aa";
    const call = { id: 1, jsonrpc: "2.0", method: "eth_call", params: [] };
    const twoEndpoints = (emitter = new EventEmitter()): any =>
      new FallbackRpcProvider([PRIMARY, BACKUP], emitter, 11155111);

    it("fails over when the primary answers an endpoint error, so an eth_call gets the backup's result", async () => {
      const emitter = new EventEmitter();
      const failures = capture(emitter, BotEvents.RPC_FAILURE);
      const recoveries = capture(emitter, BotEvents.RPC_RECOVERED);
      const provider = twoEndpoints(emitter);
      // A pruned primary; ethers would turn this into CALL_EXCEPTION "missing revert data".
      provider.inner[0] = {
        _send: jest.fn(async (payload: any) => [
          { id: payload.id, error: { code: -32000, message: `missing trie node 0x1f, served by ${PRIMARY}` } },
        ]),
      };
      provider.inner[1] = { _send: jest.fn(async (payload: any) => [{ id: payload.id, result: "0x01" }]) };

      await expect(provider.call({ to: TARGET, data: "0x" })).resolves.toBe("0x01");

      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ method: "eth_call", from: "https://primary.example:8545" });
      expect(failures[0].err).toEqual({
        message: "missing trie node 0x1f, served by https://primary.example:8545",
        code: "-32000",
      });
      expect(JSON.stringify(failures)).not.toContain(KEY);
      expect(recoveries[0]).toMatchObject({ from: "https://primary.example:8545", to: "https://backup.example" });
    });

    it("returns a reverted call at once, without trying the backup or logging RPC_FAILURE", async () => {
      for (const error of [
        { code: 3, message: "execution reverted", data: "0x08c379a0" },
        { code: -32000, message: "execution reverted" },
      ]) {
        const emitter = new EventEmitter();
        const failures = capture(emitter, BotEvents.RPC_FAILURE);
        const provider = twoEndpoints(emitter);
        provider.inner[0] = { _send: jest.fn(async () => [{ id: 1, error }]) };
        provider.inner[1] = { _send: jest.fn(async () => [{ id: 1, result: "0x01" }]) };

        await expect(provider._send(call)).resolves.toEqual([{ id: 1, error }]);

        expect(failures).toHaveLength(0);
        expect(provider.inner[1]._send).not.toHaveBeenCalled();
      }
    });

    it("when every endpoint fails, returns the last error response, even when a later endpoint threw; rethrows only when none answered", async () => {
      const emitter = new EventEmitter();
      const failures = capture(emitter, BotEvents.RPC_FAILURE);
      const provider = twoEndpoints(emitter);
      const primaryAnswer = [{ id: 1, error: { code: -32005, message: "daily request count exceeded" } }];
      const backupAnswer = [{ id: 1, error: { code: -32000, message: "header not found" } }];
      provider.inner[0] = { _send: jest.fn(async () => primaryAnswer) };
      provider.inner[1] = { _send: jest.fn(async () => backupAnswer) };

      // ethers maps the returned response to its usual error (CALL_EXCEPTION, NONCE_EXPIRED, ...).
      await expect(provider._send(call)).resolves.toBe(backupAnswer);
      expect(failures.map((f) => f.err.code)).toEqual(["-32005", "-32000"]);

      const thrown = ethersLikeError(BACKUP);
      provider.inner[1] = { _send: jest.fn(async () => Promise.reject(thrown)) };
      await expect(provider._send(call)).resolves.toBe(primaryAnswer);

      provider.inner[0] = { _send: jest.fn(async () => Promise.reject(ethersLikeError(PRIMARY))) };
      await expect(provider._send(call)).rejects.toBe(thrown);
    });

    it("an INSUFFICIENT_FUNDS answer followed by a dead backup is still INSUFFICIENT_FUNDS, not the backup's 503", async () => {
      const provider = twoEndpoints();
      const funds = { code: -32000, message: "insufficient funds for gas * price + value: balance 0, tx cost 1" };
      provider.inner[0] = { _send: jest.fn(async (payload: any) => [{ id: payload.id, error: funds }]) };
      provider.inner[1] = {
        _send: jest.fn(async () =>
          Promise.reject(Object.assign(new Error("server response 503 Service Unavailable"), { code: "SERVER_ERROR" }))
        ),
      };

      await expect(provider.estimateGas({ to: TARGET, value: BigInt(1) })).rejects.toMatchObject({
        code: "INSUFFICIENT_FUNDS",
      });
      expect(provider.inner[1]._send).toHaveBeenCalled();
    });

    it("fails a batch over when any element is an endpoint error; a reverted element is an answer", async () => {
      const batch = [
        { id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] },
        { id: 2, jsonrpc: "2.0", method: "eth_call", params: [] },
      ];
      const emitter = new EventEmitter();
      const failures = capture(emitter, BotEvents.RPC_FAILURE);
      const provider = twoEndpoints(emitter);
      provider.inner[0] = {
        _send: jest.fn(async () => [
          { id: 1, result: "0x10" },
          { id: 2, error: { code: -32603, message: "internal error" } },
        ]),
      };
      const backupAnswer = [
        { id: 1, result: "0x10" },
        { id: 2, error: { code: 3, message: "execution reverted", data: "0x" } },
      ];
      provider.inner[1] = { _send: jest.fn(async () => backupAnswer) };

      await expect(provider._send(batch)).resolves.toBe(backupAnswer);

      expect(provider.inner[1]._send).toHaveBeenCalledWith(batch);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ method: "batch", err: { code: "-32603" } });
    });
  });

  describe("a broadcast (eth_sendRawTransaction): a node's verdict on the transaction is its answer; any other error fails over", () => {
    /** ethers v5's throw for a JSON-RPC error answer: the answer as `error`, the raw response as `body`. */
    const v5Answer = (rpcError: { code: number; message: string }) =>
      Object.assign(new Error(`processing response error (code=SERVER_ERROR)`), {
        code: "SERVER_ERROR",
        error: Object.assign(new Error(rpcError.message), { code: rpcError.code }),
        body: JSON.stringify({ jsonrpc: "2.0", id: 42, error: rpcError }),
      });
    /** ethers v5's throw when the endpoint is unreachable: no answer. */
    const v5Down = () =>
      Object.assign(new Error("missing response (requestBody=..., serverError={})"), { code: "SERVER_ERROR" });

    it("v5: already known is the send's hash, from the primary alone: the backup is not tried and nothing is logged", async () => {
      const { raw, response } = await signedSend({ nonce: 7 });
      const emitter = new EventEmitter();
      const failures = capture(emitter, BotEvents.RPC_FAILURE);
      const provider: any = new FallbackProviderV5([PRIMARY, BACKUP], emitter);
      provider.inner[0] = {
        send: jest.fn(async () => Promise.reject(v5Answer({ code: -32000, message: "already known" }))),
      };
      provider.inner[1] = { send: jest.fn(async () => Promise.reject(v5Down())) };

      await expect(provider.send("eth_sendRawTransaction", [raw])).resolves.toBe(response.hash);

      expect(provider.inner[1].send).not.toHaveBeenCalled();
      expect(failures).toHaveLength(0);
      expect(provider.activeIndex).toBe(0);
    });

    it("v5: any other verdict is thrown as the node gave it, without failing over; a rate limit still fails over", async () => {
      const { raw } = await signedSend({ nonce: 7 });
      const emitter = new EventEmitter();
      const failures = capture(emitter, BotEvents.RPC_FAILURE);
      const provider: any = new FallbackProviderV5([PRIMARY, BACKUP], emitter);
      const refusal = v5Answer({ code: -32000, message: "nonce too low" });
      provider.inner[0] = { send: jest.fn(async () => Promise.reject(refusal)) };
      provider.inner[1] = { send: jest.fn(async () => "0xhash") };
      await expect(provider.send("eth_sendRawTransaction", [raw])).rejects.toBe(refusal);
      expect(provider.inner[1].send).not.toHaveBeenCalled();
      expect(failures).toHaveLength(0);

      provider.inner[0].send.mockRejectedValue(v5Answer({ code: -32005, message: "daily request count exceeded" }));
      await expect(provider.send("eth_sendRawTransaction", [raw])).resolves.toBe("0xhash");
      expect(failures).toHaveLength(1);
      expect(provider.activeIndex).toBe(1);
    });

    it("v5: when every endpoint fails, a node's answer is thrown over a later endpoint's transport error", async () => {
      const provider: any = new FallbackProviderV5([PRIMARY, BACKUP], new EventEmitter());
      const funds = v5Answer({ code: -32000, message: "insufficient funds for gas * price + value" });
      provider.inner[0] = { send: jest.fn(async () => Promise.reject(funds)) };
      const down = v5Down();
      provider.inner[1] = { send: jest.fn(async () => Promise.reject(down)) };
      await expect(provider.send("eth_estimateGas", [])).rejects.toBe(funds);

      provider.inner[0].send.mockRejectedValue(v5Down());
      await expect(provider.send("eth_estimateGas", [])).rejects.toBe(down);
    });

    it("v6: a verdict is returned at once, without failing over or logging RPC_FAILURE", async () => {
      const { raw } = await signedSend({ nonce: 7 });
      const emitter = new EventEmitter();
      const failures = capture(emitter, BotEvents.RPC_FAILURE);
      const provider: any = new FallbackRpcProvider([PRIMARY, BACKUP], emitter, 11155111);
      const refusal = [{ id: 1, error: { code: -32000, message: "nonce too low: next nonce 8, tx nonce 7" } }];
      provider.inner[0] = { _send: jest.fn(async () => refusal) };
      provider.inner[1] = { _send: jest.fn(async () => [{ id: 1, result: "0x01" }]) };

      await expect(
        provider._send({ id: 1, jsonrpc: "2.0", method: "eth_sendRawTransaction", params: [raw] })
      ).resolves.toEqual(refusal);
      expect(provider.inner[1]._send).not.toHaveBeenCalled();
      expect(failures).toHaveLength(0);
    });

    /** Every healthy endpoint answers a send these words: geth's, Nethermind's and Besu's. */
    const VERDICTS = [
      "nonce too low: next nonce 8, tx nonce 7",
      "OldNonce",
      "insufficient funds for gas * price + value: address 0x01 have 0 want 1",
      "InsufficientFunds, Account balance: 0, cumulative cost: 1",
      "transaction underpriced: tip needed 1, tip permitted 0",
      "replacement transaction underpriced",
      "FeeTooLow, MaxFeePerGas too low",
      "max fee per gas less than block base fee: address 0x01, maxFeePerGas: 1, baseFee: 2",
      "intrinsic gas too low: have 0, want 21000",
      "exceeds block gas limit",
      "oversized data: transaction size 200000, limit 131072",
      "invalid sender",
      "invalid chain id for signer: have 1 want 11155111",
      "Wrong chainId",
    ];
    /** The endpoint failing to take a send, which another endpoint may take (HTTP-200 provider faults among them). */
    const ENDPOINT_FAILURES: any[] = [
      { code: -32603, message: "internal error" },
      { code: -32601, message: "the method eth_sendRawTransaction does not exist/is not available" },
      { code: -32000, message: "sequencer temporarily not available" },
      {},
    ];

    it("v6: each verdict on the transaction is final: returned as the node gave it, the backup never tried", async () => {
      const { raw } = await signedSend({ nonce: 7 });
      for (const message of VERDICTS) {
        const emitter = new EventEmitter();
        const failures = capture(emitter, BotEvents.RPC_FAILURE);
        const provider: any = new FallbackRpcProvider([PRIMARY, BACKUP], emitter, 11155111);
        const refusal = [{ id: 1, error: { code: -32000, message } }];
        provider.inner[0] = { _send: jest.fn(async () => refusal) };
        provider.inner[1] = { _send: jest.fn(async () => [{ id: 1, result: "0x01" }]) };

        await expect(
          provider._send({ id: 1, jsonrpc: "2.0", method: "eth_sendRawTransaction", params: [raw] })
        ).resolves.toEqual(refusal);
        expect(provider.inner[1]._send).not.toHaveBeenCalled();
        expect(failures).toHaveLength(0);
      }
    });

    it("v6: any other error is the endpoint failing: the same signed bytes go to the backup, which takes them", async () => {
      const { raw, response } = await signedSend({ nonce: 7 });
      const send = { id: 1, jsonrpc: "2.0", method: "eth_sendRawTransaction", params: [raw] };
      for (const error of ENDPOINT_FAILURES) {
        const emitter = new EventEmitter();
        const failures = capture(emitter, BotEvents.RPC_FAILURE);
        const recoveries = capture(emitter, BotEvents.RPC_RECOVERED);
        const provider: any = new FallbackRpcProvider([PRIMARY, BACKUP], emitter, 11155111);
        provider.inner[0] = { _send: jest.fn(async () => [{ id: 1, error }]) };
        provider.inner[1] = { _send: jest.fn(async (payload: any) => [{ id: payload.id, result: response.hash }]) };

        await expect(provider._send(send)).resolves.toEqual([{ id: 1, result: response.hash }]);
        expect(provider.inner[1]._send).toHaveBeenCalledWith(send);
        expect(failures).toHaveLength(1);
        expect(recoveries).toHaveLength(1);
        expect(provider.activeIndex).toBe(1);
      }
    });

    it("v5: any other node answer is the endpoint failing: the same signed bytes go to the backup, which takes them", async () => {
      const { raw, response } = await signedSend({ nonce: 7 });
      for (const error of ENDPOINT_FAILURES.filter((e) => typeof e.code === "number")) {
        const emitter = new EventEmitter();
        const failures = capture(emitter, BotEvents.RPC_FAILURE);
        const provider: any = new FallbackProviderV5([PRIMARY, BACKUP], emitter);
        provider.inner[0] = { send: jest.fn(async () => Promise.reject(v5Answer(error))) };
        provider.inner[1] = { send: jest.fn(async () => response.hash) };

        await expect(provider.send("eth_sendRawTransaction", [raw])).resolves.toBe(response.hash);
        expect(provider.inner[1].send).toHaveBeenCalledWith("eth_sendRawTransaction", [raw]);
        expect(failures).toHaveLength(1);
        expect(provider.activeIndex).toBe(1);
      }
    });

    it("v6: a batch failed over for another element is answered already known by the backup: the send's hash", async () => {
      const { raw, response } = await signedSend({ nonce: 7 });
      const batch = [
        { id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] },
        { id: 2, jsonrpc: "2.0", method: "eth_sendRawTransaction", params: [raw] },
      ];
      const emitter = new EventEmitter();
      const failures = capture(emitter, BotEvents.RPC_FAILURE);
      const provider: any = new FallbackRpcProvider([PRIMARY, BACKUP], emitter, 11155111);
      // The primary takes the transaction but rate-limits the block number beside it.
      provider.inner[0] = {
        _send: jest.fn(async () => [
          { id: 1, error: { code: 429, message: "Too Many Requests" } },
          { id: 2, result: response.hash },
        ]),
      };
      provider.inner[1] = {
        _send: jest.fn(async () => [
          { id: 1, result: "0x10" },
          { id: 2, error: { code: -32000, message: "already known" } },
        ]),
      };

      await expect(provider._send(batch)).resolves.toEqual([
        { id: 1, result: "0x10" },
        { id: 2, result: response.hash },
      ]);
      expect(failures).toHaveLength(1);
    });
  });

  it("with a fallback endpoint, each endpoint gives up on a rate limit after a couple of attempts (v6 and v5)", () => {
    // ethers' default is 12 attempts with backoff: minutes on one throttled endpoint.
    const throttle = jest.spyOn(FetchRequest.prototype, "setThrottleParams");
    const v6: any = new FallbackRpcProvider([PRIMARY, BACKUP], new EventEmitter(), 11155111);
    v6.getInner(0);
    v6.getInner(1);
    expect(throttle.mock.calls).toEqual([
      [{ maxAttempts: RATE_LIMITED_ATTEMPTS_WITH_FALLBACK }],
      [{ maxAttempts: RATE_LIMITED_ATTEMPTS_WITH_FALLBACK }],
    ]);
    const v5: any = new FallbackProviderV5([PRIMARY, BACKUP], new EventEmitter());
    expect(v5.getInner(0).connection.throttleLimit).toBe(RATE_LIMITED_ATTEMPTS_WITH_FALLBACK);

    // A single endpoint has nothing to fail over to: ethers' default retry is kept.
    throttle.mockClear();
    (new FallbackRpcProvider([PRIMARY], new EventEmitter(), 11155111) as any).getInner(0);
    expect(throttle).not.toHaveBeenCalled();
    expect(
      (new FallbackProviderV5([PRIMARY], new EventEmitter()) as any).getInner(0).connection.throttleLimit
    ).not.toBe(RATE_LIMITED_ATTEMPTS_WITH_FALLBACK);
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
