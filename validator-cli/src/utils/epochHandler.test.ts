import { setEpochRange, getLatestChallengeableEpoch } from "./epochHandler";

describe("epochHandler", () => {
  describe("setEpochRange", () => {
    const currentEpoch = 1000000;

    const mockedEpochPeriod = 1000;
    const mockedSeqDelayLimit = 1000;
    const startCoolDown = 7 * 24 * 60 * 60;
    const currentTimestamp = currentEpoch * mockedEpochPeriod;
    const now = (currentTimestamp + mockedEpochPeriod + 1) * 1000; // In ms
    const startEpoch =
      Math.floor((currentTimestamp - (mockedSeqDelayLimit + mockedEpochPeriod + startCoolDown)) / mockedEpochPeriod) -
      2;
    it("should return the correct epoch range", () => {
      const mockedFetchBridgeConfig = jest.fn(() => ({
        epochPeriod: mockedEpochPeriod,
        sequencerDelayLimit: mockedSeqDelayLimit,
      }));
      const result = setEpochRange(currentEpoch * mockedEpochPeriod, 1, now, mockedFetchBridgeConfig as any);
      expect(result[result.length - 1]).toEqual(currentEpoch - 1);
      expect(result[0]).toEqual(startEpoch);
    });
  });

  describe("getLatestChallengeableEpoch", () => {
    it("should return the correct epoch number", () => {
      const chainId = 1;
      const now = 1626325200000;
      const fetchBridgeConfig = jest.fn(() => ({
        epochPeriod: 600,
      }));
      const result = getLatestChallengeableEpoch(chainId, now, fetchBridgeConfig as any);
      expect(result).toEqual(now / (600 * 1000) - 2);
    });
  });
});
