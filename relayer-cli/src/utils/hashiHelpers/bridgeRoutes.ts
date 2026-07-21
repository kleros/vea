interface IHashiBridge {
  sourceChainId: number;
  targetChainId: number;
  sourceRPC: string | string[];
  targetRPC: string | string[];
  yahoAddress: string; // Hashi (Yaho) contract address
  yaruAddress: string; // Hashi (Yaru) contract address
  hashiAddress: string; // Hashi (Hashi) contract address
}

// Hashi executors
const hashiBridges: { [chainPair: string]: IHashiBridge } = {
  "421614-11155111": {
    sourceChainId: 421614,
    targetChainId: 11155111,
    sourceRPC: process.env.RPC_ARBITRUM_SEPOLIA
      ? process.env.RPC_ARBITRUM_SEPOLIA.split(",").map((s) => s.trim())
      : process.env.RPC_ARBITRUM_SEPOLIA!,
    targetRPC: process.env.RPC_SEPOLIA
      ? process.env.RPC_SEPOLIA.split(",").map((s) => s.trim())
      : process.env.RPC_SEPOLIA!,
    yahoAddress: "0xDbdF80c87f414fac8342e04D870764197bD3bAC7", // Hashi (Yaho) contract address on Arbitrum Sepolia
    yaruAddress: "0x231e48AAEaAC6398978a1dBA4Cd38fcA208Ec391", // Hashi (Yaru) contract address on Sepolia
    hashiAddress: "0x78E4ae687De18B3B71Ccd0e8a3A76Fed49a02A02", // Hashi (Hashi) contract address on Sepolia
  },
  "421614-10200": {
    sourceChainId: 421614,
    targetChainId: 10200,
    targetRPC: process.env.RPC_CHIADO
      ? process.env.RPC_CHIADO.split(",").map((s) => s.trim())
      : process.env.RPC_CHIADO!,
    sourceRPC: process.env.RPC_ARBITRUM_SEPOLIA
      ? process.env.RPC_ARBITRUM_SEPOLIA.split(",").map((s) => s.trim())
      : process.env.RPC_ARBITRUM_SEPOLIA!,
    yahoAddress: "0xDbdF80c87f414fac8342e04D870764197bD3bAC7", // Hashi (Yaho) contract address on Arbitrum Sepolia
    yaruAddress: "0x639c26C9F45C634dD14C599cBAa27363D4665C53", // Hashi (Yaru) contract address on Chiado
    hashiAddress: "0x78E4ae687De18B3B71Ccd0e8a3A76Fed49a02A02", // Hashi (Hashi) contract address on Chiado
  },
  "1514-42161": {
    sourceChainId: 1514,
    targetChainId: 42161,
    sourceRPC: process.env.RPC_STORY ? process.env.RPC_STORY.split(",").map((s) => s.trim()) : process.env.RPC_STORY!,
    targetRPC: process.env.RPC_ARBITRUM_ONE
      ? process.env.RPC_ARBITRUM_ONE.split(",").map((s) => s.trim())
      : process.env.RPC_ARBITRUM_ONE!,
    yahoAddress: "0x0313f25f51f8846fdDFaBCb7F0672e4D3E1C0E76", // Hashi (Yaho) contract address on Story
    yaruAddress: "0x43017e1d9f66f7E7Be4055CFf6a490F57aF9b8De", // Hashi (Yaru) contract address on Arbitrum One
    hashiAddress: "0x84757602e211E2B2afFB6b1a171f9B05E9Ef0a66", // Hashi (Hashi) contract address on Arbitrum One
  },
  "42161-1514": {
    sourceChainId: 42161,
    targetChainId: 1514,
    sourceRPC: process.env.RPC_ARBITRUM_ONE
      ? process.env.RPC_ARBITRUM_ONE.split(",").map((s) => s.trim())
      : process.env.RPC_ARBITRUM_ONE!,
    targetRPC: process.env.RPC_STORY ? process.env.RPC_STORY.split(",").map((s) => s.trim()) : process.env.RPC_STORY!,
    yahoAddress: "0xD0375320591ff87797CEb03CBeE80C82fD61BC77", // Hashi (Yaho) contract address on Arbitrum One
    yaruAddress: "0x5f629f27BA26E17e7E309D886A8490d9e0124bd1", // Hashi (Yaru) contract address on Story
    hashiAddress: "0xDdb3cBE1EBdF9095618913C90383AD33d5170C32", // Hashi (Hashi) contract address on Story
  },
};

export const getHashiBridgeConfig = (sourceChainId: number, targetChainId: number): IHashiBridge | undefined => {
  const key = `${sourceChainId}-${targetChainId}`;
  return hashiBridges[key];
};
