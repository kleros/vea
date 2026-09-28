// Bounded JSON-RPC client: one timeout per call, a fixed number of attempts,
// no backoff loops. RPC URLs may carry credentials, so anything that reaches a
// log or report goes through redactUrl().
import { selector } from "./keccak.mjs";

export function redactUrl(url) {
  try {
    const u = new URL(url);
    const hasSecret = u.pathname.length > 1 || u.search || u.username || u.password;
    return `${u.protocol}//${u.host}${hasSecret ? "/[redacted]" : ""}`;
  } catch {
    return "[invalid-url]";
  }
}

export class RpcError extends Error {}

export function createRpc(url, { timeoutMs = 15_000, attempts = 2, fetchImpl = fetch } = {}) {
  let id = 0;
  async function once(method, params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        signal: controller.signal,
      });
      if (!res.ok) throw new RpcError(`HTTP ${res.status} from ${redactUrl(url)} for ${method}`);
      const body = await res.json();
      if (body.error) throw new RpcError(`${method} failed: ${body.error.message ?? JSON.stringify(body.error)}`);
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }
  async function call(method, params = []) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        return await once(method, params);
      } catch (err) {
        lastErr = err;
      }
    }
    throw new RpcError(`${method} via ${redactUrl(url)} failed after ${attempts} attempts: ${lastErr?.message}`);
  }
  return {
    url,
    redacted: redactUrl(url),
    chainId: async () => Number(BigInt(await call("eth_chainId"))),
    codeSize: async (address) => (await call("eth_getCode", [address, "latest"])).replace(/^0x/, "").length / 2,
    ethCall: (to, data) => call("eth_call", [{ to, data }, "latest"]),
  };
}

/* ---- tiny ABI helpers, enough for the identity getters we use ---- */

const word = (hex) => hex.replace(/^0x/, "").padStart(64, "0");
export const encodeCall = (signature, args = []) =>
  selector(signature) + args.map((a) => word(BigInt(a).toString(16))).join("");

const strip = (hex) => hex.replace(/^0x/, "");
export const decodeAddress = (hex) => "0x" + strip(hex).slice(24, 64);
export const decodeUint = (hex) => BigInt("0x" + (strip(hex).slice(0, 64) || "0"));
export const decodeBool = (hex) => decodeUint(hex) === 1n;
export const decodeBytes32 = (hex) => "0x" + strip(hex).slice(0, 64);
export function decodeString(hex) {
  const h = strip(hex);
  const offset = Number(BigInt("0x" + h.slice(0, 64))) * 2;
  const len = Number(BigInt("0x" + h.slice(offset, offset + 64))) * 2;
  return Buffer.from(h.slice(offset + 64, offset + 64 + len), "hex").toString("utf8");
}
