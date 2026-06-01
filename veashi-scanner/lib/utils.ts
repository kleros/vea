import { getAllSourceChains } from "@kleros/veashi-sdk";
import { getViemChain } from "./chains";

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
  const chainIds = getAllSourceChains();

  try {
    const foundChainId = await Promise.any(
      chainIds.map(async (chainId) => {
        const chain = getViemChain(chainId);
        if (!chain) throw new Error("Chain not supported:" + chainId);
        const response = await fetch(chain.rpcUrls.default.http[0], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getTransactionByHash",
            params: [hash],
            id: 1,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP Error on chain ${chainId}`);
        }

        const data = await response.json();

        if (data.result && data.result.hash === hash) {
          return chainId;
        }
        throw new Error(`Tx not found on chain ${chainId}`);
      })
    );

    console.log(`Found transaction on chainId: ${foundChainId}`);
    return foundChainId;
  } catch (error) {
    // Promise.any throws an AggregateError only if EVERY promise is rejected
    console.log(`Transaction ${hash} not found on any supported chains.`);
    return null;
  }
}
