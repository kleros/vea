// File for handling contants and configurations
require("dotenv").config();
import veaInboxArbToEthDevnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthDevnet.json";
import veaOutboxArbToEthDevnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json";
import veaInboxArbToEthTestnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthTestnet.json";
import veaOutboxArbToEthTestnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";

import veaInboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToGnosisDevnet.json";
import veaOutboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";

import veaInboxArbToGnosisTestnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";
import veaOutboxArbToGnosisTestnet from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisTestnet.json";

interface IBridge {
  chainId: number;
  chain: string;
  epochPeriod: number;
  veaContracts: { [key in Networks]: VeaContracts };
  batcher: string;
  rpcOutbox: string;
}

type VeaContracts = {
  veaInbox: any;
  veaOutbox: any;
};

enum Networks {
  DEVNET = "devnet",
  TESTNET = "testnet",
}

const arbToEthContracts: { [key in Networks]: VeaContracts } = {
  [Networks.DEVNET]: {
    veaInbox: veaInboxArbToEthDevnet,
    veaOutbox: veaOutboxArbToEthDevnet,
  },
  [Networks.TESTNET]: {
    veaInbox: veaInboxArbToEthTestnet,
    veaOutbox: veaOutboxArbToEthTestnet,
  },
};

const arbToGnosisContracts: { [key in Networks]: VeaContracts } = {
  [Networks.DEVNET]: {
    veaInbox: veaInboxArbToGnosisDevnet,
    veaOutbox: veaOutboxArbToGnosisDevnet,
  },
  [Networks.TESTNET]: {
    veaInbox: veaInboxArbToGnosisTestnet,
    veaOutbox: veaOutboxArbToGnosisTestnet,
  },
};

// Using destination chainId to get the route configuration.
const bridges: { [chainId: number]: IBridge } = {
  11155111: {
    chainId: 11155111,
    chain: "sepolia",
    epochPeriod: 7200,
    veaContracts: arbToEthContracts,
    batcher: process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS_SEPOLIA,
    rpcOutbox: process.env.RPC_SEPOLIA,
  },
  10200: {
    chainId: 10200,
    chain: "chiado",
    epochPeriod: 3600,
    veaContracts: arbToGnosisContracts,
    batcher: process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS_CHIADO,
    rpcOutbox: process.env.RPC_CHIADO,
  },
};

// Getters
const getBridgeConfig = (chainId: number): IBridge | undefined => {
  return bridges[chainId];
};

const getEpochPeriod = (chainId: number): number => {
  return bridges[chainId].epochPeriod;
};

export { getBridgeConfig, getEpochPeriod, Networks };
