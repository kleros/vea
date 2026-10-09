import { EventEmitter } from "node:events";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BotEvents } from "./botEvents";
import { RATE_LIMITED_ATTEMPTS_WITH_FALLBACK, redactRpcError, redactUrl } from "./fallbackProvider";

type RPCEndpoint = { url: string; label?: string };

/**
 * Whether a `send` failure is the node answering that the call reverted. ethers v5 throws the
 * JSON-RPC error (`code` 3, or -32000 with "execution reverted") as `err.error`, with the raw
 * response in `err.body`. Every healthy endpoint gives the same answer, so it is the call's
 * result, not an endpoint failure.
 */
export const isExecutionRevert = (err: any): boolean => {
  const rpcError = err?.error ?? err;
  if (rpcError?.code === 3) return true;
  return (
    /execution reverted/i.test(String(rpcError?.message ?? "")) || /execution reverted/i.test(String(err?.body ?? ""))
  );
};

/**
 * ethers v5 (`@ethersproject/providers`) JSON-RPC provider that transparently fails over to the next
 * endpoint when a request fails. A reverted call is rethrown as is: it is not retried elsewhere
 * nor logged as an RPC failure (callers such as the `findBatchContainingBlock` bisection expect it).
 */
export class FallbackProviderV5 extends JsonRpcProvider {
  private endpoints: RPCEndpoint[];
  private activeIndex = 0;
  private emitter: EventEmitter;
  private inner: JsonRpcProvider[] = [];

  constructor(endpoints: string | (string | RPCEndpoint)[], emitter: EventEmitter) {
    const list = Array.isArray(endpoints) ? endpoints : [endpoints];
    const normalized = list.map((e) => (typeof e === "string" ? { url: e } : e));
    if (normalized.length === 0) throw new Error("FallbackProviderV5 requires at least one RPC endpoint");
    super(normalized[0].url);
    this.endpoints = normalized;
    this.emitter = emitter;
  }

  private label(i: number) {
    return redactUrl(this.endpoints[i].label ?? this.endpoints[i].url);
  }

  // Overrides the low-level transport so ALL RPC calls go through the fallback logic.
  async send(method: string, params: Array<any>): Promise<any> {
    let lastErr: any;
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      const i = (this.activeIndex + attempt) % this.endpoints.length;
      try {
        const result = await this.getInner(i).send(method, params);
        if (i !== this.activeIndex) {
          this.emitter.emit(BotEvents.RPC_RECOVERED, { method, from: this.label(this.activeIndex), to: this.label(i) });
          this.activeIndex = i;
        }
        return result;
      } catch (err: any) {
        if (isExecutionRevert(err)) throw err;
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
      this.inner[i] = new JsonRpcProvider(
        this.endpoints.length > 1
          ? { url: this.endpoints[i].url, throttleLimit: RATE_LIMITED_ATTEMPTS_WITH_FALLBACK }
          : this.endpoints[i].url
      );
    }
    return this.inner[i];
  }
}
