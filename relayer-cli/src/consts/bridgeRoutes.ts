// File for handling contants and configurations
require("dotenv").config();
import { MissingEnvironmentVariable } from "../utils/errors";
import veaInboxArbToEthDevnet from "../../../contracts/deployments/arbitrumSepolia/VeaInboxArbToEthDevnet.json";
import veaOutboxArbToEthDevnet from "../../../contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json";
import veaInboxArbToEthTestnet from "../../../contracts/deployments/arbitrumSepolia/VeaInboxArbToEthTestnet.json";
import veaOutboxArbToEthTestnet from "../../../contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";

import veaInboxArbToGnosisDevnet from "../../../contracts/deployments/arbitrumSepolia/VeaInboxArbToGnosisDevnet.json";
import veaOutboxArbToGnosisDevnet from "../../../contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";

import veaInboxArbToGnosisTestnet from "../../../contracts/deployments/arbitrumSepolia/VeaInboxArbToGnosisTestnet.json";
import veaOutboxArbToGnosisTestnet from "../../../contracts/deployments/chiado/VeaOutboxArbToGnosisTestnet.json";

interface IBridge {
  chainId: number;
  chain: string;
  epochPeriod: number;
  veaContracts: { [key in Network]: VeaContracts };
  batcherAddress: string;
  rpcInbox: string | string[];
  rpcOutbox: string | string[];
  yahoAddress?: string; // Hashi (Yaru) contract address
  yaruAddress?: string; // Hashi (Yaru) contract address
  hashiAddress?: string; // Hashi (Yaru) contract address
}

type VeaContracts = {
  veaInbox: any;
  veaOutbox: any;
};

enum Network {
  DEVNET = "devnet",
  TESTNET = "testnet",
}

const arbToEthContracts: { [key in Network]: VeaContracts } = {
  [Network.DEVNET]: {
    veaInbox: veaInboxArbToEthDevnet,
    veaOutbox: veaOutboxArbToEthDevnet,
  },
  [Network.TESTNET]: {
    veaInbox: veaInboxArbToEthTestnet,
    veaOutbox: veaOutboxArbToEthTestnet,
  },
};

const arbToGnosisContracts: { [key in Network]: VeaContracts } = {
  [Network.DEVNET]: {
    veaInbox: veaInboxArbToGnosisDevnet,
    veaOutbox: veaOutboxArbToGnosisDevnet,
  },
  [Network.TESTNET]: {
    veaInbox: veaInboxArbToGnosisTestnet,
    veaOutbox: veaOutboxArbToGnosisTestnet,
  },
};

const requireRpcEnv = (name: string): string[] => {
  const value = process.env[name];
  if (!value) throw new MissingEnvironmentVariable(name);
  return value.split(",").map((s) => s.trim());
};

// Using destination chainId to get the route configuration.
const bridges: { [chainId: number]: IBridge } = {
  11155111: {
    chainId: 11155111,
    chain: "sepolia",
    epochPeriod: 7200,
    veaContracts: arbToEthContracts,
    batcherAddress: process.env.TRANSACTION_BATCHER_CONTRACT_SEPOLIA!,
    rpcInbox: requireRpcEnv("RPC_ARBITRUM_SEPOLIA"),
    rpcOutbox: requireRpcEnv("RPC_SEPOLIA"),
    yahoAddress: "0xDbdF80c87f414fac8342e04D870764197bD3bAC7", // Hashi (Yaho) contract address on Arbitrum Sepolia
    yaruAddress: "0x231e48AAEaAC6398978a1dBA4Cd38fcA208Ec391", // Hashi (Yaru) contract address on Sepolia
    hashiAddress: "0x78E4ae687De18B3B71Ccd0e8a3A76Fed49a02A02", // Hashi (Hashi) contract address on Sepolia
  },
  10200: {
    chainId: 10200,
    chain: "chiado",
    epochPeriod: 3600,
    veaContracts: arbToGnosisContracts,
    batcherAddress: process.env.TRANSACTION_BATCHER_CONTRACT_CHIADO!,
    rpcInbox: requireRpcEnv("RPC_ARBITRUM_SEPOLIA"),
    rpcOutbox: requireRpcEnv("RPC_CHIADO"),
    yahoAddress: "0xDbdF80c87f414fac8342e04D870764197bD3bAC7", // Hashi (Yaho) contract address on Arbitrum Sepolia
    yaruAddress: "0x639c26C9F45C634dD14C599cBAa27363D4665C53", // Hashi (Yaru) contract address on Chiado
    hashiAddress: "0x78E4ae687De18B3B71Ccd0e8a3A76Fed49a02A02", // Hashi (Hashi) contract address on Chiado
  },
};

// Getters
const getBridgeConfig = (chainId: number): IBridge => {
  const bridge = bridges[chainId];
  if (!bridge) throw new Error(`Unsupported chainId: ${chainId}`);
  return bridge;
};

const getEpochPeriod = (chainId: number): number => {
  const bridge = bridges[chainId];
  if (!bridge.epochPeriod) throw new Error(`Unsupported chainId: ${chainId}`);
  return bridge.epochPeriod;
};

export { getBridgeConfig, getEpochPeriod, Network };
