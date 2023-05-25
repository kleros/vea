import * as Bridges from "./bridges";
import { VeaClientConfig, VeaClient } from "./client";

const configure = (bridge: Bridges.Bridge, inboxRpc: string, outboxRpc: string): VeaClient => {
  // TODO: Check if the RPCs chainIds match the bridge chainIds
  return {
    config: {
      bridge,
      inboxRpc: inboxRpc,
      outboxRpc: outboxRpc,
    },
  };
};

export const configureArbitrumGoerliToChiadoDevnet = (inboxRpc: string, outboxRpc: string): VeaClient => {
  return configure(Bridges.arbitrumGoerliToChiadoDevnet, inboxRpc, outboxRpc);
};

export const configureArbitrumGoerliToGoerliDevnet = (inboxRpc: string, outboxRpc: string): VeaClient => {
  return configure(Bridges.arbitrumGoerliToGoerliDevnet, inboxRpc, outboxRpc);
};
