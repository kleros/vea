require("dotenv").config();

interface Bridge {
  chain: string;
  epochPeriod: number;
  deposit: bigint;
  minChallengePeriod: number;
  sequencerDelayLimit: number;
  inboxRPC: string;
  outboxRPC: string;
  inboxAddress: string;
  outboxAddress: string;
  routerAddress?: string;
  routerProvider?: string;
}

const bridges: { [chainId: number]: Bridge } = {
  11155111: {
    chain: "sepolia",
    epochPeriod: 7200,
    deposit: BigInt("1000000000000000000"),
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
    inboxRPC: process.env.RPC_ARB,
    outboxRPC: process.env.RPC_ETH,
    inboxAddress: process.env.VEAINBOX_ARB_TO_ETH_ADDRESS,
    outboxAddress: process.env.VEAOUTBOX_ARB_TO_ETH_ADDRESS,
  },
  10200: {
    chain: "chiado",
    epochPeriod: 3600,
    deposit: BigInt("1000000000000000000"),
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
    inboxRPC: process.env.RPC_ARB,
    outboxRPC: process.env.RPC_GNOSIS,
    routerProvider: process.env.RPC_ETH,
    inboxAddress: process.env.VEAINBOX_ARB_TO_GNOSIS_ADDRESS,
    routerAddress: process.env.VEA_ROUTER_ARB_TO_GNOSIS_ADDRESS,
    outboxAddress: process.env.VEAOUTBOX_ARB_TO_GNOSIS_ADDRESS,
  },
};

const getBridgeConfig = (chainId: number): Bridge | undefined => {
  return bridges[chainId];
};

export { getBridgeConfig, Bridge };
