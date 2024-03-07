import VeaInboxArbitrumGoerli from "@kleros/vea-contracts/deployments/arbitrumSepolia/VeaInboxArbToEthDevnet.json";
import VeaOutboxGoerli from "@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json";
import { Chain, arbitrumGoerli, goerli } from "@wagmi/chains";
import Arbitrum from "tsx:svgs/chains/arbitrum.svg";
import Ethereum from "tsx:svgs/chains/ethereum.svg";

export interface IChain extends Chain {
  logo: React.FC<React.SVGAttributes<SVGElement>>;
}

export const supportedChains = [
  { ...arbitrumGoerli, logo: Arbitrum },
  { ...goerli, logo: Ethereum },
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
    from: arbitrumGoerli.id,
    to: goerli.id,
    inboxAddress: VeaInboxArbitrumGoerli.address as `0x${string}`,
    inboxEndpoint:
      "https://api.studio.thegraph.com/query/67213/veascan-inbox-arb-sep-devnet/version/latest",
    outboxAddress: VeaOutboxGoerli.address as `0x${string}`,
    outboxEndpoint:
      "https://api.studio.thegraph.com/query/67213/veascan-outbox-arb-sep-devnet/version/latest",
  },
];
