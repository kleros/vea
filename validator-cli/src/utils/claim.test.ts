import { ethers, getAddress } from "ethers";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { getClaim, hashClaim, getClaimResolveState, ClaimResolveStateParams } from "./claim";
import { ClaimNotFoundError } from "./errors";
import { MockEmitter } from "./emitter";
import { Network } from "../consts/bridgeRoutes";

let mockClaim: ClaimStruct;
// Pre calculated from the deployed contracts
const hashedMockClaim = "0xfee47661ef0432da320c3b4706ff7d412f421b9d1531c33ce8f2e03bfe5dcfa2";
const mockBlockTag = "latest";
const mockFromBlock = 0;
const network = Network.DEVNET;

describe("snapshotClaim", () => {
  describe("getClaim", () => {
    let veaOutbox: any;
    let veaOutboxProvider: any;
    const epoch = 1;
    let mockClaimParams: any;
    let mockFetchClaim: jest.Mock;
    const mockEmitter = new MockEmitter();
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
        filters: {
          VerificationStarted: jest.fn(),
          Challenged: jest.fn(),
          Claimed: jest.fn(),
        },
        claimHashes: jest.fn(),
        getAddress: jest.fn(),
      };
      veaOutboxProvider = {
        getBlock: jest.fn().mockResolvedValueOnce({ timestamp: mockClaim.timestampClaimed, number: 1234 }),
      };
      mockFetchClaim = jest.fn();
      mockClaimParams = {
        network,
        chainId: 0,
        veaOutbox,
        veaOutboxProvider,
        epoch,
        fromBlock: mockFromBlock,
        toBlock: mockBlockTag,
        emitter: mockEmitter,
        fetchClaimForEpoch: mockFetchClaim,
      };
    });

    it("should return a valid claim", async () => {
      veaOutbox.claimHashes = jest.fn().mockResolvedValueOnce(hashedMockClaim);
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
      mockClaimParams.veaOutbox = veaOutbox;
      const claim = await getClaim(mockClaimParams);

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
      mockClaimParams.veaOutbox = veaOutbox;
      const claim = await getClaim(mockClaimParams);
      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
    });

    it("should return a valid claim with verification", async () => {
      mockClaim.timestampVerification = 1234;
      mockClaim.blocknumberVerification = 1234;
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      veaOutboxProvider.getBlock.mockResolvedValueOnce({ timestamp: mockClaim.timestampVerification });
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
      mockClaimParams.veaOutbox = veaOutbox;
      mockClaimParams.veaOutboxProvider = veaOutboxProvider;

      const claim = await getClaim(mockClaimParams);

      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
    });
    it("should return a claim with fallback on subgraphs", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashedMockClaim);

      veaOutbox.queryFilter.mockImplementationOnce(() => {
        throw new Error("Logs not available");
      });

      const claimFromGraph = {
        id: "1",
        stateroot: mockClaim.stateRoot,
        bridger: mockClaim.claimer,
        timestamp: mockClaim.timestampClaimed,
        verification: null,
        challenge: null,
      };

      mockClaimParams.veaOutbox = veaOutbox;
      mockClaimParams.fetchClaimForEpoch = mockFetchClaim.mockResolvedValueOnce(claimFromGraph);
      const claim = await getClaim(mockClaimParams);
      expect(claim).toBeDefined();
      expect(claim).toEqual(mockClaim);
    });

    it("should return null if no claim is found", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(ethers.ZeroHash);
      mockClaimParams.veaOutbox = veaOutbox;
      const claim = await getClaim(mockClaimParams);
      expect(claim).toBeNull();
      expect(veaOutbox.queryFilter).toHaveBeenCalledTimes(0);
    });

    it("should throw an error if no claim is found", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashedMockClaim);
      veaOutbox.queryFilter
        .mockImplementationOnce(() => Promise.resolve([]))
        .mockImplementationOnce(() => Promise.resolve([]))
        .mockImplementationOnce(() => Promise.resolve([]));
      mockClaimParams.emitter = mockEmitter;
      mockClaimParams.fetchClaimForEpoch = jest.fn().mockResolvedValueOnce(null);
      mockClaimParams.veaOutbox = veaOutbox;
      await expect(async () => {
        await getClaim(mockClaimParams);
      }).rejects.toThrow(new ClaimNotFoundError(epoch));
    });

    it("should throw an error if the claim is not valid", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      mockClaim.honest = 1;
      veaOutbox.queryFilter
        .mockImplementationOnce(() =>
          Promise.resolve([
            {
              data: mockClaim.stateRoot,
              topics: [null, `0x000000000000000000000000${ethers.ZeroAddress.toString().slice(2)}`],
              blockNumber: 1234,
            },
          ])
        ) // For Claimed
        .mockImplementationOnce(() => []) // For Challenged
        .mockImplementationOnce(() => Promise.resolve([])); // For VerificationStarted
      mockClaimParams.veaOutbox = veaOutbox;

      await expect(async () => {
        await getClaim(mockClaimParams);
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

  describe("getClaimResolveState", () => {
    let veaInbox: any;
    let veaOutbox: any;
    let fetchSentSnapshotData: any;
    const epoch = 1;
    const blockNumberOutboxLowerBound = 1234;
    const toBlock = "latest";
    let mockClaimResolveStateParams: any;
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
      veaInbox = {
        queryFilter: jest.fn(),
        filters: {
          SnapshotSent: jest.fn(),
        },
        getAddress: jest.fn(),
      };
      veaOutbox = {
        claimHashes: jest.fn().mockResolvedValueOnce(hashedMockClaim),
        getAddress: jest.fn(),
      };
      fetchSentSnapshotData = jest.fn().mockResolvedValueOnce(hashedMockClaim);
      mockClaimResolveStateParams = {
        chainId: 11155111,
        veaInbox,
        veaOutbox,
        veaInboxProvider: {
          getBlock: jest.fn().mockResolvedValueOnce({ timestamp: mockClaim.timestampClaimed, number: 1234 }),
        } as any,
        veaOutboxProvider: {
          getBlock: jest.fn().mockResolvedValueOnce({ timestamp: mockClaim.timestampClaimed, number: 1234 }),
        } as any,
        epoch,
        fromBlock: blockNumberOutboxLowerBound,
        toBlock,
        fetchMessageStatus: jest.fn(),
        fetchSentSnapshotData,
      };
    });

    it("should return pending state for both", async () => {
      veaInbox.queryFilter.mockResolvedValueOnce([]);
      const claimResolveState = await getClaimResolveState(mockClaimResolveStateParams);
      expect(claimResolveState).toBeDefined();
      expect(claimResolveState.sendSnapshot.status).toBeFalsy();
      expect(claimResolveState.execution.status).toBe(0);
    });

    it("should return pending state for execution", async () => {
      veaInbox.queryFilter.mockResolvedValueOnce([{ transactionHash: "0x1234" }]);
      const mockGetMessageStatus = jest.fn().mockResolvedValueOnce(0);
      mockClaimResolveStateParams.fetchMessageStatus = mockGetMessageStatus;
      const claimResolveState = await getClaimResolveState(mockClaimResolveStateParams);
      expect(claimResolveState).toBeDefined();
      expect(claimResolveState.sendSnapshot.status).toBeTruthy();
      expect(claimResolveState.execution.status).toBe(0);
    });

    it("should return false state if incorrect snapshot sent", async () => {
      veaInbox.queryFilter.mockResolvedValueOnce([{ transactionHash: "0x1234" }]);
      fetchSentSnapshotData = jest.fn().mockResolvedValueOnce("0xincorrecthash");
      mockClaimResolveStateParams.fetchSentSnapshotData = fetchSentSnapshotData;
      const claimResolveState = await getClaimResolveState(mockClaimResolveStateParams);
      expect(claimResolveState).toBeDefined();
      expect(claimResolveState.sendSnapshot.status).toBeFalsy();
      expect(claimResolveState.execution.status).toBe(0);
    });
  });
});
