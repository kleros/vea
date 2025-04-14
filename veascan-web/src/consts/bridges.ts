import VeaInboxArbitrumSepoliaDevnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthDevnet.json";
import VeaOutboxSepoliaDevnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json";
import VeaInboxArbitrumSepoliaTestnet from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthTestnet.json";
import VeaOutboxArbitrumSepoliaTestnet from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";

import {
  Chain,
  arbitrumSepolia,
  sepolia,
  gnosisChiado,
} from "@wagmi/core/chains";
import Arbitrum from "tsx:svgs/chains/arbitrum.svg";
import Ethereum from "tsx:svgs/chains/ethereum.svg";
import Gnosis from "tsx:svgs/chains/gnosis.svg";

export enum Network {
  DEVNET = "devnet",
  TESTNET = "testnet",
}

type VeaContracts = {
  veaInbox: `0x${string}`;
  veaOutbox: `0x${string}`;
};

const arbToEthContracts: { [key in Network]: VeaContracts } = {
  [Network.DEVNET]: {
    veaInbox: VeaInboxArbitrumSepoliaDevnet.address as `0x${string}`,
    veaOutbox: VeaOutboxSepoliaDevnet.address as `0x${string}`,
  },
  [Network.TESTNET]: {
    veaInbox: VeaInboxArbitrumSepoliaTestnet.address as `0x${string}`,
    veaOutbox: VeaOutboxArbitrumSepoliaTestnet.address as `0x${string}`,
  },
};

export interface IChain extends Chain {
  logo: React.FC<React.SVGAttributes<SVGElement>>;
}

export const supportedChains = [
  { ...arbitrumSepolia, logo: Arbitrum },
  { ...sepolia, logo: Ethereum },
  { ...gnosisChiado, logo: Gnosis },
];

export const getChain = (id: number): IChain =>
  supportedChains.find((chain) => chain.id === id) as IChain;

export interface IBridge {
  id: number;
  from: number;
  to: number;
  contracts: { [key in Network]: VeaContracts };
  inboxEndpoint: string;
  outboxEndpoint: string;
}

export const bridges: IBridge[] = [
  {
    id: 0,
    from: arbitrumSepolia.id,
    to: sepolia.id,
    contracts: arbToEthContracts,
    inboxEndpoint: `https://api.studio.thegraph.com/query/${process.env.VEASCAN_INBOX_SUBGRAPH}`,
    outboxEndpoint: `https://api.studio.thegraph.com/query/${process.env.VEASCAN_OUTBOX_SUBGRAPH}`,
  },
];

export const getBridge = (id: number): IBridge =>
  bridges.find((bridge) => bridge.id === id) as IBridge;
