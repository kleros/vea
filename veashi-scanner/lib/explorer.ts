import { getViemChain } from "./chains";

/**
 * Builds a block-explorer "view address" URL for a given chain, or
 * `undefined` if the chain has no known explorer in viem's chain registry.
 */
export function getExplorerAddressUrl(chainId: number, address: string): string | undefined {
  const baseUrl = getViemChain(chainId)?.blockExplorers?.default?.url;
  if (!baseUrl) return undefined;
  return `${baseUrl}/address/${address}`;
}

/**
 * Builds a block-explorer "view transaction" URL for a given chain, or
 * `undefined` if the chain has no known explorer in viem's chain registry.
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string | undefined {
  const baseUrl = getViemChain(chainId)?.blockExplorers?.default?.url;
  if (!baseUrl) return undefined;
  return `${baseUrl}/tx/${txHash}`;
}

/** Builds a block-explorer "view block" URL, or `undefined` if the chain has no known explorer. */
export function getExplorerBlockUrl(chainId: number, block: number): string | undefined {
  const baseUrl = getViemChain(chainId)?.blockExplorers?.default?.url;
  if (!baseUrl) return undefined;
  return `${baseUrl}/block/${block}`;
}

/** The explorer's name ("Arbiscan", "Basescan"), or "the explorer" when viem lists none. */
export function getExplorerName(chainId: number): string {
  return getViemChain(chainId)?.blockExplorers?.default?.name ?? "the explorer";
}
