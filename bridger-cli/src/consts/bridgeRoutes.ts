interface IBridge {
  chain: string;
  epochPeriod: number;
  deposit: bigint;
  minChallengePeriod: number;
  sequencerDelayLimit: number;
}

const bridges: { [chainId: number]: IBridge } = {
  11155111: {
    chain: "sepolia",
    epochPeriod: 7200,
    deposit: BigInt("1000000000000000000"),
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
  },
  10200: {
    chain: "chiado",
    epochPeriod: 3600,
    deposit: BigInt("1000000000000000000"),
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
  },
};

const getBridgeConfig = (chainId: number): IBridge | undefined => {
  return bridges[chainId];
};

export { getBridgeConfig };
