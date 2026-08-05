import { EventEmitter } from "node:events";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BotEvents } from "./botEvents";

type RPCEndpoint = { url: string; label?: string };

/**
 * ethers v5 (`@ethersproject/providers`) JSON-RPC provider that transparently fails over to the next
 * endpoint when a request fails.
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
    return this.endpoints[i].label ?? this.endpoints[i].url;
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
        lastErr = err;
        this.emitter.emit(BotEvents.RPC_FAILURE, {
          method,
          from: this.label(this.activeIndex),
          to: this.label(i),
          err,
        });
      }
    }
    throw lastErr;
  }

  private getInner(i: number) {
    if (!this.inner[i]) {
      this.inner[i] = new JsonRpcProvider(this.endpoints[i].url);
    }
    return this.inner[i];
  }
}
