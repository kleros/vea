import * as Bridges from "./bridges";

export type VeaClientConfig = {
  bridge: Bridges.Bridge;
  inboxRpc: string;
  outboxRpc: string;
};

export type VeaClient = {
  config: VeaClientConfig;
};
