require("dotenv").config();

import veaInboxArbToEthDevnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthDevnet.json";
import veaOutboxArbToEthDevnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json";
import veaInboxArbToEthTestnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthTestnet.json";
import veaOutboxArbToEthTestnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";

import veaInboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToGnosisDevnet.json";
import veaOutboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";

import veaInboxArbToGnosisTestnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToGnosisTestnet.json";
import veaOutboxArbToGnosisTestnet from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisTestnet.json";
import veaRouterArbToGnosisTestnet from "@kleros/vea-contracts/deployments/sepolia/RouterArbToGnosisTestnet.json";
interface Bridge {
  chain: string;
  minChallengePeriod: number;
  sequencerDelayLimit: number;
  inboxRPC: string;
  outboxRPC: string;
  routerRPC?: string;
  routeConfig: { [key in Network]: RouteConfigs };
  depositToken?: string;
}

type RouteConfigs = {
  veaInbox: any;
  veaOutbox: any;
  veaRouter?: any;
  epochPeriod: number;
  deposit: bigint;
};

export enum Network {
  DEVNET = "devnet",
  TESTNET = "testnet",
}

const arbToEthConfigs: { [key in Network]: RouteConfigs } = {
  [Network.DEVNET]: {
    veaInbox: veaInboxArbToEthDevnet,
    veaOutbox: veaOutboxArbToEthDevnet,
    epochPeriod: 1800,
    deposit: BigInt("1000000000000000000"),
  },
  [Network.TESTNET]: {
    veaInbox: veaInboxArbToEthTestnet,
    veaOutbox: veaOutboxArbToEthTestnet,
    epochPeriod: 7200,
    deposit: BigInt("1000000000000000000"),
  },
};

const arbToGnosisConfigs: { [key in Network]: RouteConfigs } = {
  [Network.DEVNET]: {
    veaInbox: veaInboxArbToGnosisDevnet,
    veaOutbox: veaOutboxArbToGnosisDevnet,
    epochPeriod: 1800,
    deposit: BigInt("100000000000000000"),
  },
  [Network.TESTNET]: {
    veaInbox: veaInboxArbToGnosisTestnet,
    veaOutbox: veaOutboxArbToGnosisTestnet,
    veaRouter: veaRouterArbToGnosisTestnet,
    epochPeriod: 3600,
    deposit: BigInt("200000000000000000"),
  },
};

export const bridges: { [chainId: number]: Bridge } = {
  11155111: {
    chain: "sepolia",
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
    inboxRPC: process.env.RPC_ARB,
    outboxRPC: process.env.RPC_ETH,
    routeConfig: arbToEthConfigs,
  },
  10200: {
    chain: "chiado",
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
    inboxRPC: process.env.RPC_ARB,
    outboxRPC: process.env.RPC_GNOSIS,
    routerRPC: process.env.RPC_ETH,
    routeConfig: arbToGnosisConfigs,
    depositToken: process.env.GNOSIS_WETH,
  },
};

const getBridgeConfig = (chainId: number): Bridge => {
  const bridge = bridges[chainId];
  if (!bridge) throw new Error(`Bridge not found for chain`);
  return bridges[chainId];
};

export { getBridgeConfig, Bridge };
