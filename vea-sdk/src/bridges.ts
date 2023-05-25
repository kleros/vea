import VeaInboxArbToGnosisDevnetDeployment from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToGnosisDevnet.json";
import VeaOutboxArbToGnosisDevnetDeployment from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";

import VeaInboxArbToEthDevnetDeployment from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToEthDevnet.json";
import VeaOutboxArbToEthDevnetDeployment from "@kleros/vea-contracts/deployments/goerli/VeaOutboxArbToEthDevnet.json";

import {
  VeaInboxArbToEth__factory,
  VeaOutboxArbToGnosisDevnet__factory,
  VeaOutboxArbToEthDevnet__factory,
} from "@kleros/vea-contracts/typechain-types";

export type VeaInboxFactory = typeof VeaInboxArbToEth__factory;
export type VeaOutboxFactory = typeof VeaOutboxArbToGnosisDevnet__factory | typeof VeaOutboxArbToEthDevnet__factory;

export type Bridge = {
  label: string;
  inboxChainId: number;
  outboxChainId: number;
  inboxAddress: `0x${string}`;
  outboxAddress: `0x${string}`;
  inboxFactory: VeaInboxFactory;
  outboxFactory: VeaOutboxFactory;
  inboxSubgraph: string;
  outboxSubgraph: string;
};

const getSubgraphUrl = (subgraph: string): string => {
  return `https://api.thegraph.com/subgraphs/name/shotaronowhere/${subgraph}`;
};

export const arbitrumGoerliToChiadoDevnet: Bridge = {
  label: "Arbitrum to Chiado Devnet",
  inboxChainId: 421613,
  outboxChainId: 10200,
  inboxAddress: VeaInboxArbToGnosisDevnetDeployment.address as `0x${string}`,
  outboxAddress: VeaOutboxArbToGnosisDevnetDeployment.address as `0x${string}`,
  inboxFactory: VeaInboxArbToEth__factory,
  outboxFactory: VeaOutboxArbToGnosisDevnet__factory,
  inboxSubgraph: getSubgraphUrl("vea-inbox-arbgoerli-to-chiado"),
  outboxSubgraph: getSubgraphUrl("FIX ME"), // TODO
};

export const arbitrumGoerliToGoerliDevnet: Bridge = {
  label: "Arbitrum to Goerli Devnet",
  inboxChainId: 5,
  outboxChainId: 10200,
  inboxAddress: VeaInboxArbToEthDevnetDeployment.address as `0x${string}`,
  outboxAddress: VeaOutboxArbToEthDevnetDeployment.address as `0x${string}`,
  inboxFactory: VeaInboxArbToEth__factory,
  outboxFactory: VeaOutboxArbToEthDevnet__factory,
  inboxSubgraph: getSubgraphUrl("vea-inbox-arbgoerli-to-goerli"),
  outboxSubgraph: getSubgraphUrl("FIXME"), // TODO,
};
