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
    // A modelled outbox chain: block n has timestamp 12n, head finalized at 5000.
    const SEC_PER_BLOCK = 12;
    const HEAD_BLOCK = 5000;
    const epoch = 1;
    const epochPeriod = 7200;
    // Claims for epoch E can only be made during [(E+1)*P, (E+2)*P) - blocks 1200..1799 here.
    const claimWindowFirstBlock = ((epoch + 1) * epochPeriod) / SEC_PER_BLOCK; // 1200
    const claimWindowLastBlock = ((epoch + 2) * epochPeriod) / SEC_PER_BLOCK - 1; // 1799
    // Deliberately in the last third of the window: the old implementation anchored
    // its scan at block E*P (600) and clamped it to 1000 blocks, so a claim here was
    // invisible to it. This is the A1 detection gap.
    const claimedBlock = 1750;

    let veaOutbox: any;
    let veaOutboxProvider: any;
    let queriedRanges: Array<{ event: string; from: number; to: number }>;
    let mockClaimParams: any;
    let mockFetchClaim: jest.Mock;
    const mockEmitter = new MockEmitter();

    const claimedLog = () => ({
      data: mockClaim.stateRoot,
      topics: [null, `0x000000000000000000000000${mockClaim.claimer.toString().slice(2)}`],
      blockNumber: claimedBlock,
      index: 0,
    });

    beforeEach(() => {
      queriedRanges = [];
      mockClaim = {
        stateRoot: "0xeac817ed5c5b3d1c2c548f231b7cf9a0dfd174059f450ec6f0805acf6a16a551",
        claimer: "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288",
        timestampClaimed: claimedBlock * SEC_PER_BLOCK,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      };
      veaOutbox = {
        queryFilter: jest.fn(async (filter: any, from: number, to: number) => {
          queriedRanges.push({ event: filter?.event ?? "unknown", from, to });
          return [];
        }),
        filters: {
          VerificationStarted: jest.fn(() => ({ event: "VerificationStarted" })),
          Challenged: jest.fn(() => ({ event: "Challenged" })),
          Claimed: jest.fn(() => ({ event: "Claimed" })),
        },
        claimHashes: jest.fn(),
        getAddress: jest.fn(),
      };
      veaOutboxProvider = {
        getBlock: jest.fn(async (tag: any) => {
          const number = typeof tag === "number" ? tag : HEAD_BLOCK;
          return { number, timestamp: number * SEC_PER_BLOCK };
        }),
      };
      mockFetchClaim = jest.fn();
      mockClaimParams = {
        network,
        chainId: 0,
        veaOutbox,
        veaOutboxProvider,
        epoch,
        epochPeriod,
        emitter: mockEmitter,
        fetchClaimForEpoch: mockFetchClaim,
      };
    });

    /** Serve the given logs for `event`, and nothing for every other event. */
    const serve = (logsByEvent: Record<string, any[]>) => {
      veaOutbox.queryFilter = jest.fn(async (filter: any, from: number, to: number) => {
        const event = filter?.event ?? "unknown";
        queriedRanges.push({ event, from, to });
        return (logsByEvent[event] ?? []).filter((log) => log.blockNumber >= from && log.blockNumber <= to);
      });
      mockClaimParams.veaOutbox = veaOutbox;
    };

    const rangesFor = (event: string) => queriedRanges.filter((r) => r.event === event);

    it("scans the whole window in which a claim for the epoch could have been made", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({ Claimed: [claimedLog()] });

      await getClaim(mockClaimParams);

      const claimedRanges = rangesFor("Claimed");
      expect(claimedRanges.length).toBeGreaterThan(0);
      const scannedFrom = Math.min(...claimedRanges.map((r) => r.from));
      const scannedTo = Math.max(...claimedRanges.map((r) => r.to));
      // The window must contain every block in which `claim()` could have succeeded.
      expect(scannedFrom).toBeLessThanOrEqual(claimWindowFirstBlock);
      expect(scannedTo).toBeGreaterThanOrEqual(claimWindowLastBlock);
    });

    it("reads the claim hash at the same finalized block the logs are scanned to", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({ Claimed: [claimedLog()] });

      await getClaim(mockClaimParams);

      // Reading the hash at the head while scanning logs only to finalized makes
      // reconstruction fail whenever an event lands in between.
      expect(veaOutbox.claimHashes).toHaveBeenCalledWith(epoch, { blockTag: HEAD_BLOCK });
      expect(Math.max(...queriedRanges.map((r) => r.to))).toBeLessThanOrEqual(HEAD_BLOCK);
    });

    it("finds a claim made in the last third of the window", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({ Claimed: [claimedLog()] });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
      expect(mockFetchClaim).not.toHaveBeenCalled();
    });

    it("never asks the provider for blocks past the finalized head", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({ Claimed: [claimedLog()] });

      await getClaim(mockClaimParams);

      for (const range of queriedRanges) {
        expect(range.to).toBeLessThanOrEqual(HEAD_BLOCK);
        expect(range.from).toBeGreaterThanOrEqual(0);
      }
    });

    it("does not scan Challenged or VerificationStarted when the Claimed log alone reconstructs the claim", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({ Claimed: [claimedLog()] });

      await getClaim(mockClaimParams);

      expect(rangesFor("Challenged")).toHaveLength(0);
      expect(rangesFor("VerificationStarted")).toHaveLength(0);
    });

    it("returns a valid claim with a challenger", async () => {
      mockClaim.challenger = "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288";
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [claimedLog()],
        Challenged: [
          {
            blockNumber: claimedBlock + 10,
            index: 0,
            topics: [null, null, `0x000000000000000000000000${mockClaim.challenger.toString().slice(2)}`],
          },
        ],
      });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
    });

    it("scans for Challenged only from the block the claim was made in", async () => {
      mockClaim.challenger = "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288";
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [claimedLog()],
        Challenged: [
          {
            blockNumber: claimedBlock + 10,
            index: 0,
            topics: [null, null, `0x000000000000000000000000${mockClaim.challenger.toString().slice(2)}`],
          },
        ],
      });

      await getClaim(mockClaimParams);

      // A claim cannot be challenged before it exists, so scanning from block 0 is waste.
      expect(Math.min(...rangesFor("Challenged").map((r) => r.from))).toBe(claimedBlock);
    });

    it("returns a valid claim with verification", async () => {
      const verificationBlock = claimedBlock + 20;
      mockClaim.timestampVerification = verificationBlock * SEC_PER_BLOCK;
      mockClaim.blocknumberVerification = verificationBlock;
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [claimedLog()],
        VerificationStarted: [{ blockNumber: verificationBlock, index: 0 }],
      });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
    });

    it("reports honest=CLAIMER for a claim the outbox has already verified", async () => {
      const verificationBlock = claimedBlock + 20;
      mockClaim.timestampVerification = verificationBlock * SEC_PER_BLOCK;
      mockClaim.blocknumberVerification = verificationBlock;
      mockClaim.honest = 1; // Party.Claimer
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [claimedLog()],
        VerificationStarted: [{ blockNumber: verificationBlock, index: 0 }],
      });

      const claim = await getClaim(mockClaimParams);

      // The returned struct must be the one that hashes to the on-chain claim
      // hash, otherwise every contract call taking it reverts with "Invalid claim."
      expect(hashClaim(claim!)).toEqual(hashClaim(mockClaim));
      expect(claim!.honest).toEqual(1);
    });

    it("reports honest=CHALLENGER for a claim the challenger has won", async () => {
      mockClaim.challenger = "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288";
      mockClaim.honest = 2; // Party.Challenger
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [claimedLog()],
        Challenged: [
          {
            blockNumber: claimedBlock + 10,
            index: 0,
            topics: [null, null, `0x000000000000000000000000${mockClaim.challenger.toString().slice(2)}`],
          },
        ],
      });

      const claim = await getClaim(mockClaimParams);

      expect(hashClaim(claim!)).toEqual(hashClaim(mockClaim));
      expect(claim!.honest).toEqual(2);
    });

    it("falls back to the subgraph when the log scan throws", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      veaOutbox.queryFilter = jest.fn(() => {
        throw new Error("Logs not available");
      });
      mockClaimParams.veaOutbox = veaOutbox;
      mockClaimParams.fetchClaimForEpoch = mockFetchClaim.mockResolvedValueOnce({
        id: "1",
        stateRoot: mockClaim.stateRoot,
        bridger: mockClaim.claimer,
        timestamp: mockClaim.timestampClaimed,
        verification: null,
        challenge: null,
      });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
    });

    it("falls back to the subgraph when the scan finds no Claimed log despite a non-zero claim hash", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({});
      mockClaimParams.fetchClaimForEpoch = mockFetchClaim.mockResolvedValueOnce({
        id: "1",
        stateRoot: mockClaim.stateRoot,
        bridger: mockClaim.claimer,
        timestamp: mockClaim.timestampClaimed,
        verification: null,
        challenge: null,
      });

      const claim = await getClaim(mockClaimParams);

      expect(claim).toEqual(mockClaim);
    });

    it("returns null when no claim was made for the epoch", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(ethers.ZeroHash);
      mockClaimParams.veaOutbox = veaOutbox;

      const claim = await getClaim(mockClaimParams);

      expect(claim).toBeNull();
      expect(veaOutbox.queryFilter).toHaveBeenCalledTimes(0);
    });

    it("throws when neither the logs nor the subgraph yield the claim", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({});
      mockClaimParams.fetchClaimForEpoch = jest.fn().mockResolvedValueOnce(null);

      await expect(getClaim(mockClaimParams)).rejects.toThrow(new ClaimNotFoundError(epoch));
    });

    it("throws when the reconstructed claim does not match the on-chain claim hash", async () => {
      veaOutbox.claimHashes.mockResolvedValueOnce(hashClaim(mockClaim));
      serve({
        Claimed: [
          {
            data: mockClaim.stateRoot,
            topics: [null, `0x000000000000000000000000${ethers.ZeroAddress.toString().slice(2)}`],
            blockNumber: claimedBlock,
            index: 0,
          },
        ],
      });
      mockClaimParams.fetchClaimForEpoch = jest.fn().mockResolvedValueOnce(null);

      await expect(getClaim(mockClaimParams)).rejects.toThrow(new ClaimNotFoundError(epoch));
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
    // The inbox is a different chain from the outbox with its own, much larger,
    // block numbers. Modelled here as 1s blocks with the head far ahead of any
    // block number the outbox chain would produce.
    const INBOX_SEC_PER_BLOCK = 1;
    const INBOX_HEAD_BLOCK = 30_000_000;
    const epoch = 1;
    const epochPeriod = 7200;
    // `sendSnapshot` requires `_epoch < block.timestamp / epochPeriod`, so a
    // SnapshotSent for epoch E cannot exist before (E+1)*P on the inbox clock.
    const earliestSendBlock = ((epoch + 1) * epochPeriod) / INBOX_SEC_PER_BLOCK;

    let veaInbox: any;
    let veaOutbox: any;
    let fetchSentSnapshotData: any;
    let queriedRanges: Array<[number, number]>;
    let mockClaimResolveStateParams: any;

    const serveSnapshotSent = (logs: any[]) => {
      veaInbox.queryFilter = jest.fn(async (_filter: any, from: number, to: number) => {
        queriedRanges.push([from, to]);
        return logs.filter((log) => log.blockNumber >= from && log.blockNumber <= to);
      });
      mockClaimResolveStateParams.veaInbox = veaInbox;
    };

    beforeEach(() => {
      queriedRanges = [];
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
        queryFilter: jest.fn(async () => []),
        filters: {
          SnapshotSent: jest.fn(() => ({ event: "SnapshotSent" })),
        },
        getAddress: jest.fn(),
      };
      veaOutbox = {
        claimHashes: jest.fn().mockResolvedValue(hashedMockClaim),
        getAddress: jest.fn(),
      };
      fetchSentSnapshotData = jest.fn().mockResolvedValue(hashedMockClaim);
      mockClaimResolveStateParams = {
        chainId: 11155111,
        veaInbox,
        veaOutbox,
        veaInboxProvider: {
          getBlock: jest.fn(async (tag: any) => {
            const number = typeof tag === "number" ? tag : INBOX_HEAD_BLOCK;
            return { number, timestamp: number * INBOX_SEC_PER_BLOCK };
          }),
        } as any,
        veaOutboxProvider: {
          getBlock: jest.fn().mockResolvedValue({ timestamp: mockClaim.timestampClaimed, number: 1234 }),
        } as any,
        epoch,
        epochPeriod,
        fetchMessageStatus: jest.fn(),
        fetchSentSnapshotData,
      };
    });

    it("derives the scan range from the inbox chain, not from an outbox block number", async () => {
      serveSnapshotSent([]);

      await getClaimResolveState(mockClaimResolveStateParams);

      expect(queriedRanges.length).toBeGreaterThan(0);
      const scannedFrom = Math.min(...queriedRanges.map((r) => r[0]));
      const scannedTo = Math.max(...queriedRanges.map((r) => r[1]));
      expect(scannedFrom).toBeLessThanOrEqual(earliestSendBlock);
      expect(scannedTo).toBe(INBOX_HEAD_BLOCK);
    });

    it("paginates the scan instead of asking for the whole range at once", async () => {
      serveSnapshotSent([]);

      await getClaimResolveState(mockClaimResolveStateParams);

      // A single unbounded request over ~30M inbox blocks is what providers reject.
      for (const [from, to] of queriedRanges) {
        expect(to - from).toBeLessThan(10_000);
      }
    });

    it("finds a snapshot sent near the head of the inbox chain", async () => {
      serveSnapshotSent([{ blockNumber: INBOX_HEAD_BLOCK - 5, index: 0, transactionHash: "0x1234" }]);
      mockClaimResolveStateParams.fetchMessageStatus = jest.fn().mockResolvedValueOnce(0);

      const claimResolveState = await getClaimResolveState(mockClaimResolveStateParams);

      expect(claimResolveState.sendSnapshot.status).toBeTruthy();
      expect(claimResolveState.sendSnapshot.txHash).toBe("0x1234");
    });

    it("should return pending state for both", async () => {
      serveSnapshotSent([]);

      const claimResolveState = await getClaimResolveState(mockClaimResolveStateParams);

      expect(claimResolveState).toBeDefined();
      expect(claimResolveState.sendSnapshot.status).toBeFalsy();
      expect(claimResolveState.execution.status).toBe(0);
    });

    it("should return pending state for execution", async () => {
      serveSnapshotSent([{ blockNumber: earliestSendBlock + 100, index: 0, transactionHash: "0x1234" }]);
      mockClaimResolveStateParams.fetchMessageStatus = jest.fn().mockResolvedValueOnce(0);

      const claimResolveState = await getClaimResolveState(mockClaimResolveStateParams);

      expect(claimResolveState).toBeDefined();
      expect(claimResolveState.sendSnapshot.status).toBeTruthy();
      expect(claimResolveState.execution.status).toBe(0);
    });

    it("should return false state if incorrect snapshot sent", async () => {
      serveSnapshotSent([{ blockNumber: earliestSendBlock + 100, index: 0, transactionHash: "0x1234" }]);
      mockClaimResolveStateParams.fetchSentSnapshotData = jest.fn().mockResolvedValue("0xincorrecthash");

      const claimResolveState = await getClaimResolveState(mockClaimResolveStateParams);

      expect(claimResolveState).toBeDefined();
      expect(claimResolveState.sendSnapshot.status).toBeFalsy();
      expect(claimResolveState.execution.status).toBe(0);
    });
  });
});
