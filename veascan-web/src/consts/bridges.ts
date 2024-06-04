import VeaInboxArbitrumSepolia from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthDevnet.json";
import VeaOutboxSepolia from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json";
import { Chain, arbitrumSepolia, sepolia } from "@wagmi/core/chains";
import Arbitrum from "tsx:svgs/chains/arbitrum.svg";
import Ethereum from "tsx:svgs/chains/ethereum.svg";

export interface IChain extends Chain {
  logo: React.FC<React.SVGAttributes<SVGElement>>;
}

export const supportedChains = [
  { ...arbitrumSepolia, logo: Arbitrum },
  { ...sepolia, logo: Ethereum },
];

export const getChain = (id: number): IChain =>
  supportedChains.find((chain) => chain.id === id) as IChain;

interface IBridge {
  from: number;
  to: number;
  inboxAddress: `0x${string}`;
  inboxEndpoint: string;
  outboxAddress: `0x${string}`;
  outboxEndpoint: string;
}

export const bridges: IBridge[] = [
  {
    from: arbitrumSepolia.id,
    to: sepolia.id,
    inboxAddress: VeaInboxArbitrumSepolia.address as `0x${string}`,
    inboxEndpoint:
      "https://api.studio.thegraph.com/query/67213/veascan-inbox-arb-sep-devnet/version/latest",
    outboxAddress: VeaOutboxSepolia.address as `0x${string}`,
    outboxEndpoint:
      "https://api.studio.thegraph.com/query/67213/veascan-outbox-arb-sep-devnet/version/latest",
  },
];
