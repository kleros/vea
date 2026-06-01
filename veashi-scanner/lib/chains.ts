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
