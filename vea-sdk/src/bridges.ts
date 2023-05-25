import VeaInboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToGnosisDevnet.json";
import VeaOutboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";

import VeaInboxArbToEthDevnet from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToEthDevnet.json";
import VeaOutboxArbToEthDevnet from "@kleros/vea-contracts/deployments/goerli/VeaOutboxArbToEthDevnet.json";

export type Bridge = {
  label: string;
  inboxChainId: number;
  outboxChainId: number;
  inboxAddress: `0x${string}`;
  outboxAddress: `0x${string}`;
};

export const arbitrumGoerliToChiadoDevnet: Bridge = {
  label: "Arbitrum to Chiado Devnet",
  inboxChainId: 421613,
  outboxChainId: 10200,
  inboxAddress: VeaInboxArbToGnosisDevnet.address as `0x${string}`,
  outboxAddress: VeaOutboxArbToGnosisDevnet.address as `0x${string}`,
};

export const arbitrumGoerliToGoerliDevnet: Bridge = {
  label: "Arbitrum to Goerli Devnet",
  inboxChainId: 5,
  outboxChainId: 10200,
  inboxAddress: VeaInboxArbToEthDevnet.address as `0x${string}`,
  outboxAddress: VeaOutboxArbToEthDevnet.address as `0x${string}`,
};
