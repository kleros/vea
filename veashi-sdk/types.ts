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
}

export type HashiAddress = {
  reporter: `0x${string}`;
  adapter: `0x${string}`;
};

export type FlatRouteFile = {
  lzReporter?: string;
  lzAdapter?: string;

  ccipReporter?: string;
  ccipAdapter?: string;

  veaReporter?: string;
  veaAdapter?: string;

  lightbulb: string;
  switch: string;
  yaho: string;
  yaru: string;
  hashi: string;
};
