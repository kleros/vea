import { EventEmitter } from "node:events";
import { JsonRpcProvider } from "@ethersproject/providers";
import { keccak256 } from "ethers";
import { BotEvents } from "./botEvents";
import {
  ALREADY_KNOWN,
  RATE_LIMITED_ATTEMPTS_WITH_FALLBACK,
  isBroadcastVerdict,
  isRevertRpcError,
  redactRpcError,
  redactUrl,
} from "./fallbackProvider";

type RPCEndpoint = { url: string; label?: string };

/**
 * Whether a `send` failure is the node answering that the call reverted. ethers v5 throws the
 * JSON-RPC error (`code` 3, or -32000 with "execution reverted") as `err.error`, with the raw
 * response in `err.body`. Every healthy endpoint gives the same answer, so it is the call's
 * result, not an endpoint failure. The v6 provider reads the same JSON-RPC error off the response.
 */
export const isExecutionRevert = (err: any): boolean =>
  isRevertRpcError(err?.error ?? err) || /execution reverted/i.test(String(err?.body ?? ""));

/**
 * The JSON-RPC error a node answered with, when `err` carries one: ethers v5 keeps it as `err.error`
 * (with a numeric `code`). A transport failure (no response, a non-2xx status, a timeout) has none.
 */
const nodeAnswerOf = (err: any): { code: number; message?: string } | undefined =>
  typeof err?.error?.code === "number" ? err.error : undefined;

/**
 * A failed attempt that is the call's answer rather than an endpoint failure, so `send` does not fail
 * over: a revert, or a node's verdict on eth_sendRawTransaction, is thrown as is.
 *
 * @returns the send's hash when the node already holds the transaction, undefined to try the next endpoint
 */
const finalAnswerOf = (method: string, params: Array<any>, err: any): string | undefined => {
  if (isExecutionRevert(err)) throw err;
  const answer = nodeAnswerOf(err);
  if (method === "eth_sendRawTransaction" && answer && isBroadcastVerdict(answer)) {
    // The node holds it: the send succeeded. Any other verdict is thrown as the node gave it.
    if (ALREADY_KNOWN.test(String(answer.message ?? ""))) return keccak256(params[0]);
    throw err;
  }
  return undefined;
};

/**
 * ethers v5 (`@ethersproject/providers`) JSON-RPC provider that transparently fails over to the next
 * endpoint when a request fails. A reverted call is rethrown as is: it is not retried elsewhere
 * nor logged as an RPC failure (callers such as the `findBatchContainingBlock` bisection expect it).
 * So is a node's verdict on eth_sendRawTransaction (`isBroadcastVerdict`); "already known" returns
 * the send's hash. When every endpoint fails, the last node answer is thrown over a later
 * transport error, so ethers still maps it (INSUFFICIENT_FUNDS, NONCE_EXPIRED).
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
    let lastAnswer: any;
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
        const heldHash = finalAnswerOf(method, params, err);
        if (heldHash !== undefined) return heldHash;
        lastErr = err;
        if (nodeAnswerOf(err)) lastAnswer = err;
        this.emitter.emit(BotEvents.RPC_FAILURE, {
          method,
          from: this.label(this.activeIndex),
          to: this.label(i),
          err: redactRpcError(err),
        });
      }
    }
    throw lastAnswer ?? lastErr;
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
