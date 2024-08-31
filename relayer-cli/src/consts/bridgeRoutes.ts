// File for handling contants and configurations
require("dotenv").config();

interface IBridge {
  chainId: number;
  veaInbox: string;
  veaOutbox: string;
  batcher: string;
  rpcOutbox: string;
}

// Using destination chainId to get the route configuration.
const bridges: { [chainId: number]: IBridge } = {
  11155111: {
    chainId: 11155111,
    veaInbox: process.env.VEAINBOX_ARBSEPOLIA_TO_SEPOLIA_ADDRESS,
    veaOutbox: process.env.VEAOUTBOX_ARBSEPOLIA_TO_SEPOLIA_ADDRESS,
    batcher: process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS_SEPOLIA,
    rpcOutbox: process.env.RPC_SEPOLIA,
  },
  10200: {
    chainId: 10200,
    veaInbox: process.env.VEAINBOX_ARBSEPOLIA_TO_CHIADO_ADDRESS,
    veaOutbox: process.env.VEAOUTBOX_ARBSEPOLIA_TO_CHIADO_ADDRESS,
    batcher: process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS_CHIADO,
    rpcOutbox: process.env.RPC_CHIADO,
  },
};

const getBridgeConfig = (chainId: number): IBridge | undefined => {
  return bridges[chainId];
};

const getInboxSubgraph = (chainId: number): string => {
  switch (chainId) {
    case 11155111:
      return process.env.VEAINBOX_ARBSEPOLIA_TO_SEPOLIA_SUBGRAPH;
    case 10200:
      return process.env.VEAINBOX_ARBSEPOLIA_TO_SEPOLIA_SUBGRAPH;
    default:
      throw new Error("Invalid chainid");
  }
};

export { getBridgeConfig, getInboxSubgraph };
