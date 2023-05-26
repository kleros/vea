import VeaInboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToGnosisDevnet.json";
import VeaOutboxArbToGnosisDevnet from "@kleros/vea-contracts/deployments/chiado/VeaOutboxArbToGnosisDevnet.json";

import VeaInboxArbToEthDevnet from "@kleros/vea-contracts/deployments/arbitrumGoerli/VeaInboxArbToEthDevnet.json";
import VeaOutboxArbToEthDevnet from "@kleros/vea-contracts/deployments/goerli/VeaOutboxArbToEthDevnet.json";

import envVar from "./envVar";

export interface IBridge {
  label: string;
  inboxAddress: `0x${string}`;
  outboxAddress: `0x${string}`;
  inboxRpc: string;
  outboxRpc: string;
}

export const arbToGnosisDevnet: IBridge = {
  label: "Arbitrum to Chiado Devnet",
  inboxAddress: VeaInboxArbToGnosisDevnet.address as `0x${string}`,
  outboxAddress: VeaOutboxArbToGnosisDevnet.address as `0x${string}`,
  inboxRpc: envVar("RPC_ARB_GOERLI"),
  outboxRpc: envVar("RPC_CHIADO"),
};

export const arbToEthDevnet: IBridge = {
  label: "Arbitrum to Goerli Devnet",
  inboxAddress: VeaInboxArbToEthDevnet.address as `0x${string}`,
  outboxAddress: VeaOutboxArbToEthDevnet.address as `0x${string}`,
  inboxRpc: envVar("RPC_ARB_GOERLI"),
  outboxRpc: envVar("RPC_GOERLI"),
};
