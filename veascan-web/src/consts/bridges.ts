import { arbitrumGoerli, goerli } from "@wagmi/chains";
import VeaInboxArbitrumGoerli from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInbox.json";
import VeaOutboxGoerli from "@kleros/vea-contracts/deployments/goerli/VeaOutbox.json";

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
      "https://api.thegraph.com/subgraphs/name/alcercu/veascantest",
    outboxAddress: VeaOutboxGoerli.address as `0x${string}`,
    outboxEndpoint:
      "https://api.thegraph.com/subgraphs/name/alcercu/veascan-outbox-goerli",
  },
];
