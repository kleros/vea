import { setEpochRange, getLatestVerifiableEpoch } from "./epochHandler";

describe("epochHandler", () => {
  describe("setEpochRange", () => {
    const startEpoch = 1000;
    const mockedEpochPeriod = 600;
    const mockedSeqDelayLimit = 600;
    const startCoolDown = 7 * 24 * 60 * 60;
    const currentTimestamp = (startEpoch + 3) * mockedEpochPeriod + startCoolDown + mockedSeqDelayLimit;
    it("should return the correct epoch range", () => {
      const chainId = 1;
      const fetchBridgeConfig = jest.fn(() => ({
        sequencerDelayLimit: mockedSeqDelayLimit,
        epochPeriod: mockedEpochPeriod,
      }));

      const mockNow = 1626325500;
      const currentClaimableEpoch = Math.floor(mockNow / (1000 * mockedEpochPeriod)) - 1;
      const result = setEpochRange(currentTimestamp, chainId, mockNow, fetchBridgeConfig as any);

      expect(result[0]).toEqual(startEpoch);
      expect(result[result.length - 1]).toEqual(currentClaimableEpoch);
      expect(result.length).toEqual(currentClaimableEpoch + 1 - startEpoch);
    });
  });

  describe("getLatestVerifiableEpoch", () => {
    it("should return the correct epoch number", () => {
      const chainId = 1;
      const now = 1626325200000;
      const fetchBridgeConfig = jest.fn(() => ({
        epochPeriod: 600,
      }));
      const result = getLatestVerifiableEpoch(chainId, now, fetchBridgeConfig as any);
      expect(result).toEqual(now / (600 * 1000) - 1);
    });
  });
});
