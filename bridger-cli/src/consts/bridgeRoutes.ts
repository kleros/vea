import { BigNumber } from "ethers";

interface IBridge {
  epochPeriod: number;
  deposit: BigNumber;
  minChallengePeriod: number;
  sequencerDelayLimit: number;
}

const bridges: { [chainId: number]: IBridge } = {
  11155111: {
    epochPeriod: 7200,
    deposit: BigNumber.from("1000000000000000000"),
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
  },
  10200: {
    epochPeriod: 3600,
    deposit: BigNumber.from("1000000000000000000"),
    minChallengePeriod: 10800,
    sequencerDelayLimit: 86400,
  },
};

const getBridgeConfig = (chainId: number): IBridge | undefined => {
  return bridges[chainId];
};

export { getBridgeConfig };
