import { ethers } from "ethers";
import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { fetchClaim, hashClaim } from "./claim";
import { ClaimNotFoundError } from "./errors";

let mockClaim: ClaimStruct;
// Pre calculated from the deployed contracts
const hashedMockClaim = "0xfee47661ef0432da320c3b4706ff7d412f421b9d1531c33ce8f2e03bfe5dcfa2";

describe("snapshotClaim", () => {
  describe("fetchClaim", () => {
    let veaOutbox: any;
    const epoch = 1;
    beforeEach(() => {
      mockClaim = {
        stateRoot: "0xeac817ed5c5b3d1c2c548f231b7cf9a0dfd174059f450ec6f0805acf6a16a551",
        claimer: "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288",
        timestampClaimed: 1730276784,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      };
      veaOutbox = {
        queryFilter: jest.fn(),
        provider: {
          getBlock: jest.fn().mockResolvedValueOnce({ timestamp: mockClaim.timestampClaimed, number: 1234 }),
        },
        filters: {
          VerificationStarted: jest.fn(),
          Challenged: jest.fn(),
          Claimed: jest.fn(),
        },
        claimHashes: jest.fn(),
      };
    });

    it("should return a valid claim", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashedMockClaim);
      veaOutbox.queryFilter
        .mockImplementationOnce(() =>
          Promise.resolve([
            {
              data: mockClaim.stateRoot,
              topics: [null, `0x000000000000000000000000${mockClaim.claimer.toString().slice(2)}`],
              blockNumber: 1234,
            },
          ])
        ) // For Claimed
        .mockImplementationOnce(() => []) // For Challenged
        .mockImplementationOnce(() => Promise.resolve([])); // For VerificationStarted

      const claim = await fetchClaim(veaOutbox, epoch);

      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
    });

    it("should return a valid claim with challenger", async () => {
      mockClaim.challenger = "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288";
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      veaOutbox.queryFilter
        .mockImplementationOnce(() =>
          Promise.resolve([
            {
              data: mockClaim.stateRoot,
              topics: [null, `0x000000000000000000000000${mockClaim.claimer.toString().slice(2)}`],
              blockNumber: 1234,
            },
          ])
        ) // For Claimed
        .mockImplementationOnce(() =>
          Promise.resolve([
            {
              blockHash: "0x1234",
              topics: [null, null, `0x000000000000000000000000${mockClaim.challenger.toString().slice(2)}`],
            },
          ])
        ) // For Challenged
        .mockImplementationOnce(() => Promise.resolve([])); // For VerificationStartedß

      const claim = await fetchClaim(veaOutbox, epoch);
      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
    });

    it("should return a valid claim with verification", async () => {
      mockClaim.timestampVerification = 1234;
      mockClaim.blocknumberVerification = 1234;
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      veaOutbox.provider.getBlock.mockResolvedValueOnce({ timestamp: mockClaim.timestampVerification });
      veaOutbox.queryFilter
        .mockImplementationOnce(() =>
          Promise.resolve([
            {
              data: mockClaim.stateRoot,
              topics: [null, `0x000000000000000000000000${mockClaim.claimer.toString().slice(2)}`],
              blockNumber: 1234,
            },
          ])
        ) // For Claimed
        .mockImplementationOnce(() => Promise.resolve([])) // For Challenged
        .mockImplementationOnce(() =>
          Promise.resolve([
            {
              blockNumber: 1234,
            },
          ])
        ); // For VerificationStarted

      const claim = await fetchClaim(veaOutbox, epoch);

      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
    });

    it("should return null if no claim is found", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(ethers.ZeroHash);

      const claim = await fetchClaim(veaOutbox, epoch);
      expect(claim).toBeNull();
      expect(veaOutbox.queryFilter).toHaveBeenCalledTimes(0);
    });

    it("should throw an error if no claim is found", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashedMockClaim);
      veaOutbox.queryFilter
        .mockImplementationOnce(() => Promise.resolve([]))
        .mockImplementationOnce(() => Promise.resolve([]))
        .mockImplementationOnce(() => Promise.resolve([]));

      await expect(async () => {
        await fetchClaim(veaOutbox, epoch);
      }).rejects.toThrow(new ClaimNotFoundError(epoch));
    });

    it("should throw an error if the claim is not valid", async () => {
      mockClaim.honest = 1;
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      veaOutbox.queryFilter
        .mockImplementationOnce(() =>
          Promise.resolve([
            {
              data: mockClaim.stateRoot,
              topics: [null, `0x000000000000000000000000${mockClaim.claimer.toString().slice(2)}`],
              blockNumber: 1234,
            },
          ])
        ) // For Claimed
        .mockImplementationOnce(() => []) // For Challenged
        .mockImplementationOnce(() => Promise.resolve([])); // For VerificationStarted

      await expect(async () => {
        await fetchClaim(veaOutbox, epoch);
      }).rejects.toThrow(new ClaimNotFoundError(epoch));
    });
  });

  describe("hashClaim", () => {
    beforeEach(() => {
      mockClaim = {
        stateRoot: "0xeac817ed5c5b3d1c2c548f231b7cf9a0dfd174059f450ec6f0805acf6a16a551",
        claimer: "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288",
        timestampClaimed: 1730276784,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      };
    });
    it("should return a valid hash", () => {
      const hash = hashClaim(mockClaim);
      expect(hash).toBeDefined();
      expect(hash).toEqual(hashedMockClaim);
    });

    it("should not return a valid hash", () => {
      mockClaim.honest = 1;
      const hash = hashClaim(mockClaim);
      expect(hash).toBeDefined();
      expect(hash).not.toEqual(hashedMockClaim);
    });
  });
});
