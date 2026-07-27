interface IHashiBridge {
  sourceChainId: number;
  targetChainId: number;
  sourceRPC: string | string[];
  targetRPC: string | string[];
  yahoAddress: string; // Hashi (Yaho) contract address
  yaruAddress: string; // Hashi (Yaru) contract address
  hashiAddress: string; // Hashi (Hashi) contract address
}

const rpcFromEnv = (envVar: string): string | string[] =>
  process.env[envVar] ? process.env[envVar]!.split(",").map((s) => s.trim()) : process.env[envVar]!;

// Hashi executors
const hashiBridges: { [chainPair: string]: IHashiBridge } = {
  // Testnet routes
  "421614-11155111": {
    sourceChainId: 421614,
    targetChainId: 11155111,
    sourceRPC: rpcFromEnv("RPC_ARBITRUM_SEPOLIA"),
    targetRPC: rpcFromEnv("RPC_SEPOLIA"),
    yahoAddress: "0xDbdF80c87f414fac8342e04D870764197bD3bAC7", // Hashi (Yaho) contract address on Arbitrum Sepolia
    yaruAddress: "0x231e48AAEaAC6398978a1dBA4Cd38fcA208Ec391", // Hashi (Yaru) contract address on Sepolia
    hashiAddress: "0x78E4ae687De18B3B71Ccd0e8a3A76Fed49a02A02", // Hashi (Hashi) contract address on Sepolia
  },
  "421614-10200": {
    sourceChainId: 421614,
    targetChainId: 10200,
    sourceRPC: rpcFromEnv("RPC_ARBITRUM_SEPOLIA"),
    targetRPC: rpcFromEnv("RPC_CHIADO"),
    yahoAddress: "0xDbdF80c87f414fac8342e04D870764197bD3bAC7", // Hashi (Yaho) contract address on Arbitrum Sepolia
    yaruAddress: "0x639c26C9F45C634dD14C599cBAa27363D4665C53", // Hashi (Yaru) contract address on Chiado
    hashiAddress: "0x78E4ae687De18B3B71Ccd0e8a3A76Fed49a02A02", // Hashi (Hashi) contract address on Chiado
  },
  "11155111-84532": {
    sourceChainId: 11155111,
    targetChainId: 84532,
    sourceRPC: rpcFromEnv("RPC_SEPOLIA"),
    targetRPC: rpcFromEnv("RPC_BASE_SEPOLIA"),
    yahoAddress: "0xb286025885808F2A2D42cd9e2204D007f52b135e", // Hashi (Yaho) contract address on Sepolia
    yaruAddress: "0xd2130B20CB7A1E11cBA1451B029020d5a33229Bc", // Hashi (Yaru) contract address on Base Sepolia
    hashiAddress: "0x3c2e4C805141BfA811e39c76aE8E1c7a1f1dC881", // Hashi (Hashi) contract address on Base Sepolia
  },
  "84532-11155111": {
    sourceChainId: 84532,
    targetChainId: 11155111,
    sourceRPC: rpcFromEnv("RPC_BASE_SEPOLIA"),
    targetRPC: rpcFromEnv("RPC_SEPOLIA"),
    yahoAddress: "0xcfD14674659bB15D0304a3608239a46A14d77554", // Hashi (Yaho) contract address on Base Sepolia
    yaruAddress: "0x17962c255EA4D3DAb522d96CDd211F839cA5dfB3", // Hashi (Yaru) contract address on Sepolia
    hashiAddress: "0x4c3D38Aba866Cf2eD79F1E877404b39e6db4fFBE", // Hashi (Hashi) contract address on Sepolia
  },
  "84532-421614": {
    sourceChainId: 84532,
    targetChainId: 421614,
    sourceRPC: rpcFromEnv("RPC_BASE_SEPOLIA"),
    targetRPC: rpcFromEnv("RPC_ARBITRUM_SEPOLIA"),
    yahoAddress: "0xf69BCD5Ff8A64919BE217bC017454aba4f6daa9D", // Hashi (Yaho) contract address on Base Sepolia
    yaruAddress: "0xEA3799EA443bf65a7Dc8C1dBfd9e64962f9Af724", // Hashi (Yaru) contract address on Arbitrum Sepolia
    hashiAddress: "0xD9d428a136d735BA618a6faE4cBdfFf311C8D5cA", // Hashi (Hashi) contract address on Arbitrum Sepolia
  },
  // Mainnet routes
  "1514-42161": {
    sourceChainId: 1514,
    targetChainId: 42161,
    sourceRPC: rpcFromEnv("RPC_STORY"),
    targetRPC: rpcFromEnv("RPC_ARBITRUM_ONE"),
    yahoAddress: "0x0313f25f51f8846fdDFaBCb7F0672e4D3E1C0E76", // Hashi (Yaho) contract address on Story
    yaruAddress: "0x43017e1d9f66f7E7Be4055CFf6a490F57aF9b8De", // Hashi (Yaru) contract address on Arbitrum One
    hashiAddress: "0x84757602e211E2B2afFB6b1a171f9B05E9Ef0a66", // Hashi (Hashi) contract address on Arbitrum One
  },
  "42161-1514": {
    sourceChainId: 42161,
    targetChainId: 1514,
    sourceRPC: rpcFromEnv("RPC_ARBITRUM_ONE"),
    targetRPC: rpcFromEnv("RPC_STORY"),
    yahoAddress: "0xD0375320591ff87797CEb03CBeE80C82fD61BC77", // Hashi (Yaho) contract address on Arbitrum One
    yaruAddress: "0x5f629f27BA26E17e7E309D886A8490d9e0124bd1", // Hashi (Yaru) contract address on Story
    hashiAddress: "0xDdb3cBE1EBdF9095618913C90383AD33d5170C32", // Hashi (Hashi) contract address on Story
  },
  "42161-8453": {
    sourceChainId: 42161,
    targetChainId: 8453,
    sourceRPC: rpcFromEnv("RPC_ARBITRUM_ONE"),
    targetRPC: rpcFromEnv("RPC_BASE"),
    yahoAddress: "0xD0375320591ff87797CEb03CBeE80C82fD61BC77", // Hashi (Yaho) contract address on Arbitrum One
    yaruAddress: "0x8eF6a2C992fCAA06C9E4e08399fad407CAB2eDBF", // Hashi (Yaru) contract address on Base
    hashiAddress: "0xC1AE18E970760e21Cca355387940e3C5BBcE4A40", // Hashi (Hashi) contract address on Base
  },
  "8453-42161": {
    sourceChainId: 8453,
    targetChainId: 42161,
    sourceRPC: rpcFromEnv("RPC_BASE"),
    targetRPC: rpcFromEnv("RPC_ARBITRUM_ONE"),
    yahoAddress: "0x88fAa01842E32beA05b167C679443009c3891183", // Hashi (Yaho) contract address on Base
    yaruAddress: "0x7Be1C881942D196D5A5Fd258F6957E1E138aaF46", // Hashi (Yaru) contract address on Arbitrum One
    hashiAddress: "0x0b7752631A63452309DE30dE2c13Fa2413cD8546", // Hashi (Hashi) contract address on Arbitrum One
  },
  "1-8453": {
    sourceChainId: 1,
    targetChainId: 8453,
    sourceRPC: rpcFromEnv("RPC_ETH"),
    targetRPC: rpcFromEnv("RPC_BASE"),
    yahoAddress: "0x47F3Ba12550dFA097c77A10eB6472a881Ea5AA0e", // Hashi (Yaho) contract address on Ethereum
    yaruAddress: "0x6edeB1ee954744512A1928B13e7C3Ce5D8Ad84fC", // Hashi (Yaru) contract address on Base
    hashiAddress: "0x99A4Cf71D089a282Ac171D9bDFEB7D182Ff13f83", // Hashi (Hashi) contract address on Base
  },
  "8453-1": {
    sourceChainId: 8453,
    targetChainId: 1,
    sourceRPC: rpcFromEnv("RPC_BASE"),
    targetRPC: rpcFromEnv("RPC_ETH"),
    yahoAddress: "0x88fAa01842E32beA05b167C679443009c3891183", // Hashi (Yaho) contract address on Base
    yaruAddress: "0x86F316598225b472b8aA8Df366C0E827C1A75C2f", // Hashi (Yaru) contract address on Ethereum
    hashiAddress: "0x8D34B750890b74e3CAF57413808315c0401BEbDA", // Hashi (Hashi) contract address on Ethereum
  },
};

export const getHashiBridgeConfig = (sourceChainId: number, targetChainId: number): IHashiBridge | undefined => {
  const key = `${sourceChainId}-${targetChainId}`;
  return hashiBridges[key];
};
