import { EventEmitter } from "node:events";
import { FetchRequest, JsonRpcPayload, JsonRpcResult, JsonRpcProvider, Network } from "ethers";
import { BotEvents } from "./botEvents";

type RPCEndpoint = { url: string; label?: string };

/**
 * Attempts ethers makes on a rate-limited (429) endpoint before giving up, when there is another
 * endpoint to fail over to. ethers' own default (12, backing off) holds the whole cycle for
 * minutes on one throttled endpoint; with a single endpoint that default is kept.
 */
export const RATE_LIMITED_ATTEMPTS_WITH_FALLBACK = 2;

/**
 * Reduce an endpoint URL to `scheme://host` (host keeps a port if it has one).
 * RPC providers put API keys in the userinfo, the path or the query, and log
 * lines are shipped off-box (Logtail), so nothing past the host is ever logged.
 */
export const redactUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (!url.host) return "<redacted-url>";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "<redacted-url>";
  }
};

// Anything that looks like `scheme://...`, up to whitespace, a quote or an angle
// bracket (ethers quotes the URLs it puts into error messages). Over-matching a
// trailing comma or bracket only drops it from the log line, never leaks.
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]+/gi;

/** Replace every URL embedded in free text (error messages, mostly) with its redacted form. */
export const redactUrlsInText = (text: string): string => text.replace(URL_IN_TEXT, (match) => redactUrl(match));

/**
 * A loggable view of an RPC error. The raw error is not logged: ethers puts the
 * request URL (with its key) into the message and into `info`/`url` fields.
 */
export const redactRpcError = (err: any): { message: string; code?: string } => {
  const message = redactUrlsInText(String(err?.shortMessage ?? err?.message ?? err));
  return err?.code !== undefined ? { message, code: String(err.code) } : { message };
};

/**
 * ethers v6 JSON-RPC provider that transparently fails over to the next endpoint when a request fails.
 */
export class FallbackRpcProvider extends JsonRpcProvider {
  private endpoints: RPCEndpoint[];
  private activeIndex = 0;
  private emitter: EventEmitter;
  private staticChainId?: number;
  private inner: JsonRpcProvider[] = [];

  constructor(endpoints: string | (string | RPCEndpoint)[], emitter: EventEmitter, chainId?: number) {
    const list = Array.isArray(endpoints) ? endpoints : [endpoints];
    const normalized = list.map((e) => (typeof e === "string" ? { url: e } : e));
    if (normalized.length === 0) throw new Error("FallbackRpcProvider requires at least one RPC endpoint");
    super(normalized[0].url, chainId !== undefined ? Network.from(chainId) : undefined);
    this.endpoints = normalized;
    this.emitter = emitter;
    this.staticChainId = chainId;
  }

  async _detectNetwork(): Promise<Network> {
    if (this.staticChainId !== undefined) return Network.from(this.staticChainId);
    return super._detectNetwork();
  }

  private label(i: number) {
    return redactUrl(this.endpoints[i].label ?? this.endpoints[i].url);
  }

  // Overrides the low-level transport so ALL RPC calls (including internal ones like eth_chainId) go through fallback logic.
  async _send(payload: JsonRpcPayload | Array<JsonRpcPayload>): Promise<Array<JsonRpcResult>> {
    const method = Array.isArray(payload) ? "batch" : payload.method;
    let lastErr: any;
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      const i = (this.activeIndex + attempt) % this.endpoints.length;
      try {
        const result = await this.getInner(i)._send(payload);
        if (i !== this.activeIndex) {
          this.emitter.emit(BotEvents.RPC_RECOVERED, { method, from: this.label(this.activeIndex), to: this.label(i) });
          this.activeIndex = i;
        }
        return result;
      } catch (err: any) {
        lastErr = err;
        this.emitter.emit(BotEvents.RPC_FAILURE, {
          method,
          from: this.label(this.activeIndex),
          to: this.label(i),
          err: redactRpcError(err),
        });
      }
    }
    throw lastErr;
  }

  private getInner(i: number) {
    if (!this.inner[i]) {
      const request = new FetchRequest(this.endpoints[i].url);
      if (this.endpoints.length > 1) request.setThrottleParams({ maxAttempts: RATE_LIMITED_ATTEMPTS_WITH_FALLBACK });
      this.inner[i] = new JsonRpcProvider(
        request,
        this.staticChainId !== undefined ? Network.from(this.staticChainId) : undefined
      );
    }
    return this.inner[i];
  }
}
