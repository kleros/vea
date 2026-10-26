import { EventEmitter } from "node:events";
import { FetchRequest, JsonRpcError, JsonRpcPayload, JsonRpcResult, JsonRpcProvider, Network, keccak256 } from "ethers";
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
 * lines are often shipped off-box, so nothing past the host is ever logged.
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
 * Whether a JSON-RPC error object is the node answering that the call reverted: `code` 3, or
 * "execution reverted" in the message (-32000 from nodes that predate code 3). Every healthy
 * endpoint gives the same answer, so it is the call's result, not an endpoint failure.
 */
export const isRevertRpcError = (rpcError: any): boolean =>
  rpcError?.code === 3 || /execution reverted/i.test(String(rpcError?.message ?? ""));

/**
 * A node's answers to a broadcast that are no failure: it holds the transaction already (geth
 * "already known", Nethermind "AlreadyKnown", Besu "Known transaction", ALREADY_EXISTS), or its
 * nonce is used (geth "nonce too low", Nethermind "OldNonce"): it was mined, or another
 * transaction took the nonce. One classifier for both fallback providers, which answer an
 * already known send with its hash, and the handlers' re-broadcast (`rebroadcast`).
 */
export const ALREADY_KNOWN = /already[ _]?(known|exists|imported)|known transaction/i;
export const NONCE_USED = /nonce (is )?too low|nonce_too_low|oldnonce/i;

/**
 * A node's refusals of a broadcast that are about the transaction, not the endpoint: its funds,
 * its fee (underpriced, a replacement underpriced, a fee cap below the base fee), its gas
 * (intrinsic gas too low, above the block gas limit), its size, or its signature (sender, chain
 * id). geth's wording, Nethermind's (InsufficientFunds, FeeTooLow) and Besu's (Wrong chainId).
 */
const BROADCAST_REFUSAL =
  /insufficient[ _]?funds|underpriced|fee ?too ?low|less than block base fee|intrinsic gas too low|exceeds block gas limit|oversized data|invalid sender|(invalid|wrong) chain ?id/i;

/**
 * Whether a JSON-RPC error answering eth_sendRawTransaction is the node's verdict on the
 * transaction, which every healthy endpoint repeats: `ALREADY_KNOWN`, `NONCE_USED` or a
 * `BROADCAST_REFUSAL`. A closed list: anything else (an internal error -32603, an unavailable
 * method, a sequencer that is down, an empty error, a rate limit) is the endpoint failing, and the
 * same signed bytes go to the next endpoint, which cannot make a second transaction of them.
 */
export const isBroadcastVerdict = (rpcError: any): boolean => {
  const message = String(rpcError?.message ?? "");
  return ALREADY_KNOWN.test(message) || NONCE_USED.test(message) || BROADCAST_REFUSAL.test(message);
};

/**
 * Whether a JSON-RPC error element answering `request` is the endpoint failing rather than
 * answering. For a call: any error but a revert (a quota -32005, "header not found" from a lagging
 * node, "missing trie node" from a pruned one). For eth_sendRawTransaction: any error but a
 * verdict on the transaction (`isBroadcastVerdict`).
 */
const isEndpointError = (request: JsonRpcPayload | undefined, rpcError: any): boolean =>
  request?.method === "eth_sendRawTransaction" ? !isBroadcastVerdict(rpcError) : !isRevertRpcError(rpcError);

const requestOf = (payloads: JsonRpcPayload[], element: { id: unknown }) =>
  payloads.find((request) => request.id === element.id);

/**
 * The first element of a JSON-RPC response that is the endpoint failing (`isEndpointError`).
 * ethers v6 throws only on transport and non-2xx failures, so these arrive as ordinary elements of
 * an HTTP 200, and ethers turns an eth_call one into CALL_EXCEPTION.
 */
const findEndpointError = (
  payloads: JsonRpcPayload[],
  response: Array<JsonRpcResult | JsonRpcError>
): JsonRpcError | undefined =>
  response.find(
    (element): element is JsonRpcError =>
      "error" in element && isEndpointError(requestOf(payloads, element), element.error)
  );

/**
 * The response with each eth_sendRawTransaction answered `ALREADY_KNOWN` turned into the send's
 * hash, `keccak256` of its signed bytes: the node holds it (an endpoint took it before the batch
 * failed over, or it is a re-broadcast), so the send succeeded.
 */
const acceptKnownSends = (
  payloads: JsonRpcPayload[],
  response: Array<JsonRpcResult | JsonRpcError>
): Array<JsonRpcResult | JsonRpcError> =>
  !payloads.some((request) => request.method === "eth_sendRawTransaction")
    ? response
    : response.map((element) => {
        if (!("error" in element) || !ALREADY_KNOWN.test(String(element.error?.message ?? ""))) return element;
        const request = requestOf(payloads, element);
        const raw = request?.method === "eth_sendRawTransaction" ? (request.params as unknown[])?.[0] : undefined;
        return typeof raw === "string" ? { id: element.id, result: keccak256(raw) } : element;
      });

/**
 * ethers v6 JSON-RPC provider that transparently fails over to the next endpoint when a request fails,
 * by throwing or by answering a JSON-RPC error. A batch fails over whole when any of its elements
 * does. A reverted call is returned as is: it is not retried elsewhere nor logged as an RPC failure.
 * So is a node's verdict on a broadcast (`isBroadcastVerdict`); "already known" is its hash.
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
    const payloads = Array.isArray(payload) ? payload : [payload];
    const method = Array.isArray(payload) ? "batch" : payload.method;
    // The last transport failure, and the last endpoint that answered with an endpoint error.
    let lastErr: any;
    let lastResponse: Array<JsonRpcResult> | undefined;
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      const i = (this.activeIndex + attempt) % this.endpoints.length;
      let failure: any;
      try {
        const result = acceptKnownSends(payloads, await this.getInner(i)._send(payload)) as Array<JsonRpcResult>;
        const endpointError = findEndpointError(payloads, result);
        if (endpointError === undefined) {
          if (i !== this.activeIndex) {
            this.emitter.emit(BotEvents.RPC_RECOVERED, {
              method,
              from: this.label(this.activeIndex),
              to: this.label(i),
            });
            this.activeIndex = i;
          }
          return result;
        }
        failure = endpointError.error;
        lastResponse = result;
      } catch (err: any) {
        failure = lastErr = err;
      }
      this.emitter.emit(BotEvents.RPC_FAILURE, {
        method,
        from: this.label(this.activeIndex),
        to: this.label(i),
        err: redactRpcError(failure),
      });
    }
    // ethers maps an error response to its usual error (CALL_EXCEPTION, INSUFFICIENT_FUNDS,
    // NONCE_EXPIRED); throwing one in its place would lose that, even when a later endpoint threw.
    // The transport error is thrown only when no endpoint answered.
    if (lastResponse !== undefined) return lastResponse;
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
