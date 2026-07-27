import { getAllSourceChains } from "@kleros/veashi-sdk";
import { getViemChain } from "./chains";

const RPC_PROBE_TIMEOUT_MS = 8_000;

export function getStatusMeta(current: number, required: number) {
  if (current >= required && required > 0) {
    return {
      label: "Confirmed",
      dotClass: "bg-green-400 animate-pulse",
      barClass: "bg-green-400",
    };
  }
  if (current > 0) {
    return {
      label: "In Progress",
      dotClass: "bg-amber-400",
      barClass: "bg-amber-400",
    };
  }
  return { label: "Pending", dotClass: "bg-red-400", barClass: "bg-red-400" };
}

export async function findChainForTx(hash: string): Promise<number | null> {
  const normalizedHash = hash.toLowerCase();
  const chainIds = getAllSourceChains();

  try {
    const foundChainId = await Promise.any(
      chainIds.map(async (chainId) => {
        const chain = getViemChain(chainId);
        if (!chain) throw new Error("Chain not supported:" + chainId);
        const rpcUrl = chain.rpcUrls.default.http[0];
        if (!rpcUrl) throw new Error("No RPC URL for chain:" + chainId);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), RPC_PROBE_TIMEOUT_MS);
        try {
          const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "eth_getTransactionByHash",
              params: [normalizedHash],
              id: 1,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`HTTP Error on chain ${chainId}`);
          }

          const data = await response.json();

          if (data.result?.hash?.toLowerCase() === normalizedHash) {
            return chainId;
          }
          throw new Error(`Tx not found on chain ${chainId}`);
        } finally {
          clearTimeout(timer);
        }
      })
    );

    console.log(`Found transaction on chainId: ${foundChainId}`);
    return foundChainId;
  } catch {
    console.log(`Transaction ${normalizedHash} not found on any supported chains.`);
    return null;
  }
}

/** Format a unix timestamp (seconds) as a short relative time, e.g. "5m ago". */
export function formatRelativeTime(unixSeconds?: number): string {
  if (unixSeconds === undefined) return "—";

  const diffSeconds = Math.max(0, Date.now() / 1000 - unixSeconds);
  const units: [string, number][] = [
    ["y", 60 * 60 * 24 * 365],
    ["d", 60 * 60 * 24],
    ["h", 60 * 60],
    ["m", 60],
  ];

  for (const [label, secondsPerUnit] of units) {
    const value = Math.floor(diffSeconds / secondsPerUnit);
    if (value >= 1) return `${value}${label} ago`;
  }
  return "just now";
}

export function parseBlockInput(value: string): number | undefined {
  if (value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}
