// File for handling contants and configurations
require("dotenv").config();
import veaOutboxArbToEthContract from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";
import veaOutboxArbToGnosisContract from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisTestnet.json";

interface IBridge {
  chainId: number;
  chain: string;
  epochPeriod: number;
  veaInboxAddress: string;
  veaOutboxAddress: string;
  batcher: string;
  rpcOutbox: string;
  veaOutboxContract: any;
}

// Using destination chainId to get the route configuration.
const bridges: { [chainId: number]: IBridge } = {
  11155111: {
    chainId: 11155111,
    chain: "sepolia",
    epochPeriod: 7200,
    veaInboxAddress: process.env.VEAINBOX_ARBSEPOLIA_TO_SEPOLIA_ADDRESS,
    veaOutboxAddress: process.env.VEAOUTBOX_ARBSEPOLIA_TO_SEPOLIA_ADDRESS,
    batcher: process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS_SEPOLIA,
    rpcOutbox: process.env.RPC_SEPOLIA,
    veaOutboxContract: veaOutboxArbToEthContract,
  },
  10200: {
    chainId: 10200,
    chain: "chiado",
    epochPeriod: 3600,
    veaInboxAddress: process.env.VEAINBOX_ARBSEPOLIA_TO_CHIADO_ADDRESS,
    veaOutboxAddress: process.env.VEAOUTBOX_ARBSEPOLIA_TO_CHIADO_ADDRESS,
    batcher: process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS_CHIADO,
    rpcOutbox: process.env.RPC_CHIADO,
    veaOutboxContract: veaOutboxArbToGnosisContract,
  },
};

// Getters
const getBridgeConfig = (chainId: number): IBridge | undefined => {
  return bridges[chainId];
};

const getEpochPeriod = (chainId: number): number => {
  return bridges[chainId].epochPeriod;
};

const getInboxSubgraph = (chainId: number): string => {
  switch (chainId) {
    case 11155111:
      return process.env.VEAINBOX_ARBSEPOLIA_TO_SEPOLIA_SUBGRAPH;
    case 10200:
      return process.env.VEAINBOX_ARBSEPOLIA_TO_CHIADO_SUBGRAPH;
    default:
      throw new Error("Invalid chainId");
  }
};

export { getBridgeConfig, getInboxSubgraph, getEpochPeriod };
