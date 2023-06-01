import { address as veaInboxArbToGnosisDevnet } from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToGnosisDevnet.json";
import { address as veaOutboxArbToGnosisDevnet } from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";

import { address as veaInboxArbToEthDevnet } from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToEthDevnet.json";
import { address as veaOutboxArbToEthDevnet } from "@kleros/vea-contracts/deployments/goerli/VeaOutboxArbToEthDevnet.json";

import {
  VeaInboxArbToEth__factory,
  VeaOutboxArbToGnosisDevnet__factory,
  VeaOutboxArbToEthDevnet__factory,
} from "@kleros/vea-contracts/typechain-types";

export type VeaInboxFactory = VeaInboxArbToEth__factory;
export type VeaOutboxFactory = VeaOutboxArbToGnosisDevnet__factory | VeaOutboxArbToEthDevnet__factory;

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
  inboxAddress: veaInboxArbToGnosisDevnet as `0x${string}`,
  outboxAddress: veaOutboxArbToGnosisDevnet as `0x${string}`,
  inboxFactory: new VeaInboxArbToEth__factory(),
  outboxFactory: new VeaOutboxArbToGnosisDevnet__factory(),
  inboxSubgraph: getSubgraphUrl("vea-inbox-arbgoerli-to-chiado"),
  outboxSubgraph: getSubgraphUrl("FIX ME"), // TODO
};

export const arbitrumGoerliToGoerliDevnet: Bridge = {
  label: "Arbitrum to Goerli Devnet",
  inboxChainId: 5,
  outboxChainId: 10200,
  inboxAddress: veaInboxArbToEthDevnet as `0x${string}`,
  outboxAddress: veaOutboxArbToEthDevnet as `0x${string}`,
  inboxFactory: new VeaInboxArbToEth__factory(),
  outboxFactory: new VeaOutboxArbToEthDevnet__factory(),
  inboxSubgraph: getSubgraphUrl("vea-inbox-arbgoerli-to-goerli"),
  outboxSubgraph: getSubgraphUrl("FIXME"), // TODO,
};
