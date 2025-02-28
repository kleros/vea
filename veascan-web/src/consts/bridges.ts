import VeaInboxArbitrumSepolia from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthDevnet.json";
import VeaOutboxSepolia from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json";
import VeaInboxArbitrumSepoliaChiado from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToGnosisDevnet.json";
import VeaOutboxArbitrumSepoliaChiado from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";

import {
  Chain,
  arbitrumSepolia,
  sepolia,
  gnosisChiado,
} from "@wagmi/core/chains";
import Arbitrum from "tsx:svgs/chains/arbitrum.svg";
import Ethereum from "tsx:svgs/chains/ethereum.svg";
import Gnosis from "tsx:svgs/chains/gnosis.svg";

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
  inboxAddress: `0x${string}`;
  inboxEndpoint: string;
  outboxAddress: `0x${string}`;
  outboxEndpoint: string;
}

export const bridges: IBridge[] = [
  {
    id: 0,
    from: arbitrumSepolia.id,
    to: sepolia.id,
    inboxAddress: VeaInboxArbitrumSepolia.address as `0x${string}`,
    inboxEndpoint: `https://api.studio.thegraph.com/query/${process.env.VEASCAN_INBOX_ARBSEPOLIA_TO_SEPOLIA_SUBGRAPH}`,
    outboxAddress: VeaOutboxSepolia.address as `0x${string}`,
    outboxEndpoint: `https://api.studio.thegraph.com/query/${process.env.VEASCAN_OUTBOX_ARBSEPOLIA_TO_SEPOLIA_SUBGRAPH}`,
  },
  {
    id: 1,
    from: arbitrumSepolia.id,
    to: gnosisChiado.id,
    inboxAddress: VeaInboxArbitrumSepoliaChiado.address as `0x${string}`,
    inboxEndpoint: `https://api.studio.thegraph.com/query/${process.env.VEASCAN_INBOX_ARBSEPOLIA_TO_CHIADO_SUBGRAPH}`,
    outboxAddress: VeaOutboxArbitrumSepoliaChiado.address as `0x${string}`,
    outboxEndpoint: `https://api.studio.thegraph.com/query/${process.env.VEASCAN_OUTBOX_ARBSEPOLIA_TO_CHIADO_SUBGRAPH}`,
  },
];

export const getBridge = (id: number): IBridge =>
  bridges.find((bridge) => bridge.id === id) as IBridge;
