import VeaInboxArbitrumGoerliGoerli from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToEthDevnet.json";
import VeaOutboxArbitrumGoerliGoerli from "@kleros/vea-contracts/deployments/goerli/VeaOutboxArbToEthDevnet.json";
import VeaInboxArbitrumGoerliChiado from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToGnosisDevnet.json";
import VeaOutboxArbitrumGoerliChiado from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";
import { Chain, arbitrumGoerli, goerli, gnosisChiado } from "@wagmi/chains";
import Arbitrum from "tsx:svgs/chains/arbitrum.svg";
import Ethereum from "tsx:svgs/chains/ethereum.svg";
import Gnosis from "tsx:svgs/chains/gnosis.svg";

export interface IChain extends Chain {
  logo: React.FC<React.SVGAttributes<SVGElement>>;
}

export const supportedChains = [
  { ...arbitrumGoerli, logo: Arbitrum },
  { ...goerli, logo: Ethereum },
  { ...gnosisChiado, logo: Gnosis },
];

export const getChain = (id: number): IChain =>
  supportedChains.find((chain) => chain.id === id) as IChain;

interface IBridge {
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
    from: arbitrumGoerli.id,
    to: goerli.id,
    inboxAddress: VeaInboxArbitrumGoerliGoerli.address as `0x${string}`,
    inboxEndpoint:
      "https://api.thegraph.com/subgraphs/name/alcercu/veascantest",
    outboxAddress: VeaOutboxArbitrumGoerliGoerli.address as `0x${string}`,
    outboxEndpoint:
      "https://api.thegraph.com/subgraphs/name/alcercu/veascan-outbox-goerli",
  },
  {
    id: 1,
    from: arbitrumGoerli.id,
    to: gnosisChiado.id,
    inboxAddress: VeaInboxArbitrumGoerliChiado.address as `0x${string}`,
    inboxEndpoint:
      "https://api.thegraph.com/subgraphs/name/alcercu/vea-inbox-arbgoerlitochiadodn",
    outboxAddress: VeaOutboxArbitrumGoerliChiado.address as `0x${string}`,
    outboxEndpoint:
      "https://api.goldsky.com/api/public/project_clh3hizxpga0j49w059761yga/subgraphs/kleros-veascan-outbox-chiado/latest/gn",
  },
];

export const getBridge = (id: number): IBridge =>
  bridges.find((bridge) => bridge.id === id) as IBridge;
