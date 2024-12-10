import { fetchClaim, ClaimStruct, hashClaim } from "./claim";

import { ethers } from "ethers";

describe("snapshotClaim", () => {
  describe("fetchClaim", () => {
    let mockClaim: ClaimStruct;
    let getClaimForEpoch: jest.Mock;
    let veaOutbox: any;
    const epoch = 1;

    beforeEach(() => {
      mockClaim = {
        stateRoot: "0x1234",
        claimer: "0x1234",
        timestampClaimed: 1234,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      };
      getClaimForEpoch = jest.fn().mockResolvedValue({
        stateroot: mockClaim.stateRoot,
        bridger: mockClaim.claimer,
        timestamp: mockClaim.timestampClaimed,
        txHash: "0x1234",
        challenged: false,
      });

      veaOutbox = {
        queryFilter: jest.fn(),
        provider: {
          getBlock: jest.fn().mockResolvedValue({ timestamp: 1234, number: 1234 }),
        },
        filters: {
          VerificationStarted: jest.fn(),
          Challenged: jest.fn(),
          Claimed: jest.fn(),
        },
      };
    });

    it("should return a valid claim", async () => {
      veaOutbox.queryFilter.mockImplementationOnce(() => Promise.resolve([]));
      veaOutbox.queryFilter.mockImplementationOnce(() =>
        Promise.resolve([{ blockHash: "0x1234", args: { challenger: ethers.constants.AddressZero } }])
      );

      const claim = await fetchClaim(veaOutbox, epoch, getClaimForEpoch);

      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
      expect(getClaimForEpoch).toHaveBeenCalledWith(epoch);
    });

    it("should return a valid claim with challenger", async () => {
      // we want fetchClaimForEpoch to return a claim
      mockClaim.challenger = "0x1234";
      veaOutbox.queryFilter.mockImplementationOnce(() => Promise.resolve([]));
      veaOutbox.queryFilter.mockImplementationOnce(() =>
        Promise.resolve([{ blockHash: "0x1234", args: { challenger: mockClaim.challenger } }])
      );
      // Update getClaimForEpoch to return a challenged claim
      getClaimForEpoch.mockResolvedValueOnce({
        stateroot: mockClaim.stateRoot,
        bridger: mockClaim.claimer,
        timestamp: mockClaim.timestampClaimed,
        txHash: "0x1234",
        challenged: true,
      });

      const claim = await fetchClaim(veaOutbox, epoch, getClaimForEpoch);

      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
      expect(getClaimForEpoch).toHaveBeenCalledWith(epoch);
    });

    it("should return a valid claim with verification", async () => {
      mockClaim.timestampVerification = 1234;
      mockClaim.blocknumberVerification = 1234;
      veaOutbox.queryFilter.mockImplementationOnce(() =>
        Promise.resolve([{ blockHash: "0x1234", args: { challenger: ethers.constants.AddressZero } }])
      );
      veaOutbox.queryFilter.mockImplementationOnce(() => Promise.resolve([]));
      getClaimForEpoch.mockResolvedValueOnce({
        stateroot: mockClaim.stateRoot,
        bridger: mockClaim.claimer,
        timestamp: mockClaim.timestampClaimed,
        txHash: "0x1234",
        challenged: false,
      });

      veaOutbox.provider.getBlock.mockResolvedValueOnce({
        timestamp: mockClaim.timestampVerification,
        number: mockClaim.blocknumberVerification,
      });

      const claim = await fetchClaim(veaOutbox, epoch, getClaimForEpoch);

      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
      expect(getClaimForEpoch).toHaveBeenCalledWith(epoch);
    });

    it("should fallback on logs if claimData is undefined", async () => {
      getClaimForEpoch.mockResolvedValueOnce(undefined);
      veaOutbox.queryFilter.mockImplementationOnce(() =>
        Promise.resolve([
          {
            blockNumber: 1234,
            data: mockClaim.stateRoot,
            topics: [ethers.constants.AddressZero, `0x${"0".repeat(24)}${mockClaim.claimer.slice(2)}`],
          },
        ])
      );
      veaOutbox.queryFilter.mockImplementationOnce(() => Promise.resolve([]));
      veaOutbox.queryFilter.mockImplementationOnce(() => Promise.resolve([]));

      const claim = await fetchClaim(veaOutbox, epoch, getClaimForEpoch);

      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
      expect(getClaimForEpoch).toHaveBeenCalledWith(epoch);
    });

    it("should throw an error if no claim is found", async () => {
      getClaimForEpoch.mockResolvedValueOnce(undefined);
      veaOutbox.queryFilter.mockImplementationOnce(() => Promise.resolve([]));
      veaOutbox.queryFilter.mockImplementationOnce(() => Promise.resolve([]));
      veaOutbox.queryFilter.mockImplementationOnce(() => Promise.resolve([]));

      await expect(async () => {
        await fetchClaim(veaOutbox, epoch, getClaimForEpoch);
      }).rejects.toThrow(`No claim found for epoch ${epoch}`);
    });
  });

  describe("hashClaim", () => {
    let mockClaim: ClaimStruct = {
      stateRoot: "0xeac817ed5c5b3d1c2c548f231b7cf9a0dfd174059f450ec6f0805acf6a16a551",
      claimer: "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288",
      timestampClaimed: 1730276784,
      timestampVerification: 0,
      blocknumberVerification: 0,
      honest: 0,
      challenger: ethers.constants.AddressZero,
    };
    // Pre calculated from the deployed contracts
    const hashOfMockClaim = "0xfee47661ef0432da320c3b4706ff7d412f421b9d1531c33ce8f2e03bfe5dcfa2";

    it("should return a valid hash", () => {
      const hash = hashClaim(mockClaim);
      expect(hash).toBeDefined();
      expect(hash).toEqual(hashOfMockClaim);
    });

    it("should not return a valid hash", () => {
      mockClaim.honest = 1;
      const hash = hashClaim(mockClaim);
      expect(hash).toBeDefined();
      expect(hash).not.toEqual(hashOfMockClaim);
    });
  });
});
