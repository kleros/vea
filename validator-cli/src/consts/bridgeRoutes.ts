require("dotenv").config();

import veaInboxArbToEthDevnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthDevnet.json";
import veaOutboxArbToEthDevnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json";
import veaInboxArbToEthTestnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthTestnet.json";
import veaOutboxArbToEthTestnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";

import veaInboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToGnosisDevnet.json";
import veaOutboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";

import veaInboxArbToGnosisTestnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";
import veaOutboxArbToGnosisTestnet from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisTestnet.json";
import veaRouterArbToGnosisTestnet from "@kleros/vea-contracts/deployments/sepolia/RouterArbToGnosisTestnet.json";
interface Bridge {
  chain: string;
  epochPeriod: number;
  deposit: bigint;
  minChallengePeriod: number;
  sequencerDelayLimit: number;
  inboxRPC: string;
  outboxRPC: string;
  routerRPC?: string;
  veaContracts: { [key in Network]: VeaContracts };
}

type VeaContracts = {
  veaInbox: any;
  veaOutbox: any;
  veaRouter?: any;
};

export enum Network {
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
    veaRouter: veaRouterArbToGnosisTestnet,
  },
};

const bridges: { [chainId: number]: Bridge } = {
  11155111: {
    chain: "sepolia",
    epochPeriod: 7200,
    deposit: BigInt("1000000000000000000"),
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
    inboxRPC: process.env.RPC_ARB,
    outboxRPC: process.env.RPC_ETH,
    veaContracts: arbToEthContracts,
  },
  10200: {
    chain: "chiado",
    epochPeriod: 3600,
    deposit: BigInt("1000000000000000000"),
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
    inboxRPC: process.env.RPC_ARB,
    outboxRPC: process.env.RPC_GNOSIS,
    routerRPC: process.env.RPC_ETH,
    veaContracts: arbToGnosisContracts,
  },
};

const getBridgeConfig = (chainId: number): Bridge | undefined => {
  return bridges[chainId];
};

export { getBridgeConfig, Bridge };
