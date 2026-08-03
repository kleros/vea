import * as viemChains from "viem/chains";
import type { Network } from "@/lib/types";

const VIEM_CHAINS = (Object.values(viemChains) as unknown[]).filter(
  (c): c is { id: number; name: string } =>
    typeof c === "object" &&
    c !== null &&
    typeof (c as Record<string, unknown>).id === "number" &&
    typeof (c as Record<string, unknown>).name === "string"
);

export function getChainName(chainId: number): string {
  return VIEM_CHAINS.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`;
}

export const getViemChain = (chainId: number) => Object.values(viemChains).find((c) => c?.id === chainId);

// Vite only statically replaces literal `import.meta.env.VITE_X` references
// at build time — a computed `import.meta.env[key]` lookup is not replaced
// and resolves to undefined in production builds. Each override must be
// referenced literally here; keep in sync with `.env.example`.
const RPC_OVERRIDES: Record<number, string | undefined> = {
  1: import.meta.env.VITE_RPC_1, // Ethereum
  1514: import.meta.env.VITE_RPC_1514, // Story
  8453: import.meta.env.VITE_RPC_8453, // Base
  10200: import.meta.env.VITE_RPC_10200, // Gnosis Chiado
  42161: import.meta.env.VITE_RPC_42161, // Arbitrum One
  84532: import.meta.env.VITE_RPC_84532, // Base Sepolia
  421614: import.meta.env.VITE_RPC_421614, // Arbitrum Sepolia
  11155111: import.meta.env.VITE_RPC_11155111, // Ethereum Sepolia
};

/**
 * RPC URL for a chain: `VITE_RPC_<chainId>` if set, else the chain's default
 * public RPC from viem. Lets any deployment swap in a dedicated/paid RPC per
 * chain without code changes, while still working out of the box.
 */
export function getRpcUrl(chainId: number): string | undefined {
  const override = RPC_OVERRIDES[chainId];
  return override || getViemChain(chainId)?.rpcUrls.default.http[0];
}

/** True if the chain is a testnet, per viem's own chain metadata. Unknown chains default to mainnet. */
export function isTestnetChain(chainId: number): boolean {
  return getViemChain(chainId)?.testnet === true;
}

/** True if a chain belongs to the given network. */
export function matchesNetwork(chainId: number, network: Network): boolean {
  return isTestnetChain(chainId) === (network === "testnet");
}
