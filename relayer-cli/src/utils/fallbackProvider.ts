import { EventEmitter } from "node:events";
import { JsonRpcPayload, JsonRpcResult, JsonRpcProvider, Network } from "ethers";
import { BotEvents } from "./botEvents";

type RPCEndpoint = { url: string; label?: string };

export class FallbackRpcProvider extends JsonRpcProvider {
  private endpoints: RPCEndpoint[];
  private activeIndex = 0;
  private emitter: EventEmitter;
  private _chainId: number;

  constructor(endpoints: (string | RPCEndpoint)[], emitter: EventEmitter, chainId: number) {
    const normalized = endpoints.map((e) => (typeof e === "string" ? { url: e } : e));
    super(normalized[0].url, Network.from(chainId));
    this.endpoints = normalized;
    this.emitter = emitter;
    this._chainId = chainId;
  }

  // Return the known network without any RPC call so a bad first URL never blocks startup.
  async _detectNetwork(): Promise<Network> {
    return Network.from(this._chainId);
  }

  private label(i: number) {
    return this.endpoints[i].label ?? this.endpoints[i].url;
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
          err,
        });
      }
    }
    throw lastErr;
  }

  private inner: JsonRpcProvider[] = [];
  private getInner(i: number) {
    if (!this.inner[i]) {
      // Pass the static network so inner providers never attempt their own network detection.
      this.inner[i] = new JsonRpcProvider(this.endpoints[i].url, Network.from(this._chainId));
    }
    return this.inner[i];
  }
}
