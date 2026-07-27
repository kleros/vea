import * as viemChains from "viem/chains";

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

/**
 * RPC URL for a chain: `VITE_RPC_<chainId>` if set, else the chain's default
 * public RPC from viem. Lets any deployment swap in a dedicated/paid RPC per
 * chain without code changes, while still working out of the box.
 */
export function getRpcUrl(chainId: number): string | undefined {
  const override = (import.meta.env as Record<string, string | undefined>)[`VITE_RPC_${chainId}`];
  return override || getViemChain(chainId)?.rpcUrls.default.http[0];
}
