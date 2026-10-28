interface MessageDispatchedArgs {
  messageId: bigint;
  message: {
    nonce: bigint;
    sender: `0x${string}`;
    data: `0x${string}`;
  };
}
export interface MessageDispatchedLog {
  eventName: "MessageDispatched";
  args: MessageDispatchedArgs;
}

export enum Bridges {
  LZ = "lz",
  CCIP = "ccip",
  VEA = "vea",
  DEBRIDGE = "deBridge",
  AXELAR = "axelar",
}

export type HashiAddress = {
  reporter: `0x${string}`;
  adapter: `0x${string}`;
};

export type FlatRouteFile = {
  axelarReporter?: string;
  axelarAdapter?: string;

  lzReporter?: string;
  lzAdapter?: string;

  ccipReporter?: string;
  ccipAdapter?: string;

  veaReporter?: string;
  veaAdapter?: string;

  deBridgeReporter?: string;
  deBridgeAdapter?: string;

  lightbulb?: string;
  switch?: string;
  yaho?: string;
  yaru?: string;
  hashi?: string;
};

export type VeaDeployment = {
  address: `0x${string}`;
  contract: string;
  network: string;
};

export type VeaRouteFile = {
  inbox: VeaDeployment;
  outbox: VeaDeployment;
  router?: VeaDeployment;
};

export type VeaRouteAddresses = {
  inbox: `0x${string}`;
  outbox: `0x${string}`;
  router?: `0x${string}`;
};
