import { getYaho, getYaru, getHashi } from "@kleros/veashi-sdk";

interface IHashiBridge {
  sourceChainId: number;
  targetChainId: number;
  sourceRPC: string | string[];
  targetRPC: string | string[];
  yahoAddress: string; // Hashi (Yaho) contract address
  yaruAddress: string; // Hashi (Yaru) contract address
  hashiAddress: string; // Hashi (Hashi) contract address
}

// The SDK owns the Yaho/Yaru/Hashi addresses for every route; the RPC wiring is
// the only piece that is local to the relayer, so it is the only thing mapped here.
const rpcEnvByChainId: { [chainId: number]: string } = {
  1: "RPC_ETH",
  1514: "RPC_STORY",
  8453: "RPC_BASE",
  10200: "RPC_CHIADO",
  42161: "RPC_ARBITRUM_ONE",
  84532: "RPC_BASE_SEPOLIA",
  421614: "RPC_ARBITRUM_SEPOLIA",
  11155111: "RPC_SEPOLIA",
};

const getRpc = (chainId: number): string | string[] => {
  const value = process.env[rpcEnvByChainId[chainId]];
  return value ? value.split(",").map((s) => s.trim()) : value!;
};

export const getHashiBridgeConfig = (sourceChainId: number, targetChainId: number): IHashiBridge | undefined => {
  const yahoAddress = getYaho(sourceChainId, targetChainId);
  const yaruAddress = getYaru(sourceChainId, targetChainId);
  const hashiAddress = getHashi(sourceChainId, targetChainId);

  // Unknown route, or a route the SDK has no Hashi deployment for.
  if (!yahoAddress || !yaruAddress || !hashiAddress) return undefined;
  if (!rpcEnvByChainId[sourceChainId] || !rpcEnvByChainId[targetChainId]) return undefined;

  return {
    sourceChainId,
    targetChainId,
    sourceRPC: getRpc(sourceChainId),
    targetRPC: getRpc(targetChainId),
    yahoAddress,
    yaruAddress,
    hashiAddress,
  };
};
