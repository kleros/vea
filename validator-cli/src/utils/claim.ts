import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { ClaimNotFoundError } from "./errors";
import { getMessageStatus } from "./arbMsgExecutor";
import {
  getClaimForEpoch,
  getChallengerForClaim,
  getVerificationForClaim,
  getSnapshotSentForEpoch,
} from "./graphQueries";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "./botEvents";
import { Network } from "../consts/bridgeRoutes";
import { blockAtTimestamp } from "./epochHandler";
import { scanLogs, findFirstLog, findLatestLog } from "./logScanner";

enum ClaimHonestState {
  NONE = 0,
  CLAIMER = 1,
  CHALLENGER = 2,
}

export interface ClaimParams {
  network: Network;
  chainId: number;
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  epoch: number;
  epochPeriod: number;
  emitter: typeof defaultEmitter;
  fetchClaimForEpoch?: typeof getClaimForEpoch;
  fetchVerificationForClaim?: typeof getVerificationForClaim;
  fetchChallengerForClaim?: typeof getChallengerForClaim;
}

/**
 * Block-time estimates and epoch boundaries are both approximate, so the claim
 * window is padded outward at both ends. Missing the block a claim was made in
 * is an unchallenged-fraud failure; scanning a few hundred extra blocks costs
 * at most one extra chunk.
 */
const CLAIM_WINDOW_PAD_BLOCKS = 256;

const emptyClaim = (): ClaimStruct => ({
  stateRoot: ethers.ZeroHash,
  claimer: ethers.ZeroAddress,
  timestampClaimed: 0,
  timestampVerification: 0,
  blocknumberVerification: 0,
  honest: 0,
  challenger: ethers.ZeroAddress,
});

/**
 * Reconstruct the claim for an epoch from the outbox's own logs.
 *
 * Both outboxes require `_epoch == block.timestamp / epochPeriod - 1` inside
 * `claim()`, so a claim for epoch E can only have been made during
 * `[(E+1)*P, (E+2)*P)`. That is a hard bound, and scanning all of it is what
 * closes the detection gap: anchoring at `E*P` and clamping to a fixed block
 * count left the tail of the window unscanned.
 *
 * Reconstruction escalates. The cheapest candidate - an unchallenged, unverified
 * claim - is tried against the on-chain claim hash first, and only if that fails
 * do we pay to scan for `Challenged` and `VerificationStarted`, which cannot
 * have been emitted before the claim itself existed.
 *
 * @returns The reconstructed claim, or null if the logs could not produce one
 */
const reconstructClaimFromLogs = async (
  { veaOutbox, veaOutboxProvider, epoch, epochPeriod, emitter }: ClaimParams,
  claimHash: string,
  headBlock: { number: number }
): Promise<ClaimStruct | null> => {
  try {
    const [windowStart, windowEnd] = await Promise.all([
      blockAtTimestamp({ provider: veaOutboxProvider, timestamp: (epoch + 1) * epochPeriod }),
      blockAtTimestamp({ provider: veaOutboxProvider, timestamp: (epoch + 2) * epochPeriod }),
    ]);
    const fromBlock = Math.max(windowStart - CLAIM_WINDOW_PAD_BLOCKS, 0);
    const toBlock = Math.min(windowEnd + CLAIM_WINDOW_PAD_BLOCKS, headBlock.number);

    // At most one `Claimed` can exist per epoch: `claim()` requires
    // `claimHashes[_epoch] == 0`, so the first hit is the only hit.
    const claimedLog = await findFirstLog({
      contract: veaOutbox,
      filter: veaOutbox.filters.Claimed(null, epoch, null),
      fromBlock,
      toBlock,
    });
    if (!claimedLog) {
      // The claim hash is non-zero, so a claim provably exists but our scan did
      // not see it. Distinct from an RPC failure, and worth its own log line.
      emitter.emit(BotEvents.CLAIMED_LOG_NOT_FOUND, epoch, fromBlock, toBlock);
      return null;
    }

    const claim = emptyClaim();
    claim.stateRoot = claimedLog.data;
    claim.claimer = `0x${claimedLog.topics[1].slice(26)}`;
    claim.timestampClaimed = (await veaOutboxProvider.getBlock(claimedLog.blockNumber)).timestamp;

    const verified = verifyClaimHash({ claim, claimHash });
    if (verified) return verified;

    const [challengeLogs, verificationLogs] = await Promise.all([
      scanLogs({
        contract: veaOutbox,
        filter: veaOutbox.filters.Challenged(epoch, null),
        fromBlock: claimedLog.blockNumber,
        toBlock: headBlock.number,
      }),
      scanLogs({
        contract: veaOutbox,
        filter: veaOutbox.filters.VerificationStarted(epoch),
        fromBlock: claimedLog.blockNumber,
        toBlock: headBlock.number,
      }),
    ]);
    if (verificationLogs.length > 0) {
      claim.blocknumberVerification = verificationLogs[0].blockNumber;
      claim.timestampVerification = (await veaOutboxProvider.getBlock(verificationLogs[0].blockNumber)).timestamp;
    }
    if (challengeLogs.length > 0) claim.challenger = "0x" + challengeLogs[0].topics[2].substring(26);
    return claim;
  } catch (error) {
    emitter.emit(BotEvents.CLAIM_LOG_SCAN_FAILED, epoch, (error as Error)?.message);
    return null;
  }
};

/**
 * Reconstruct the claim for an epoch from the indexer.
 *
 * The result is only ever trusted after `verifyClaimHash` checks it against the
 * on-chain claim hash, so a wrong answer here cannot produce a wrong decision -
 * only an inability to act.
 *
 * @returns The reconstructed claim, or null if the indexer has no claim
 */
const reconstructClaimFromGraph = async ({
  chainId,
  veaOutbox,
  veaOutboxProvider,
  epoch,
  fetchClaimForEpoch = getClaimForEpoch,
}: ClaimParams): Promise<ClaimStruct | null> => {
  const claimFromGraph = await fetchClaimForEpoch(epoch, await veaOutbox.getAddress(), chainId);
  if (!claimFromGraph) return null;

  const claim = emptyClaim();
  claim.stateRoot = claimFromGraph.stateRoot;
  claim.claimer = claimFromGraph.bridger;
  claim.timestampClaimed = claimFromGraph.timestamp;
  if (claimFromGraph.verification?.[0]?.startTimestamp) {
    claim.timestampVerification = claimFromGraph.verification[0].startTimestamp;
    const txReceipt = await veaOutboxProvider.getTransactionReceipt(claimFromGraph.verification[0].startTxHash);
    claim.blocknumberVerification = txReceipt.blockNumber;
  }
  if (claimFromGraph.challenge?.[0]) claim.challenger = claimFromGraph.challenge[0].challenger;
  return claim;
};

/**
 * Fetch the claim for an epoch, reconstructing it from logs where possible and
 * from the indexer otherwise. Either source is only accepted once it hashes to
 * the outbox's own `claimHashes[epoch]`.
 *
 * @param veaOutbox VeaOutbox contract instance
 * @param epoch epoch number of the claim to be fetched
 * @returns claim type of ClaimStruct, or null if no claim was made for the epoch
 */
const getClaim = async (params: ClaimParams): Promise<ClaimStruct | null> => {
  const { veaOutbox, veaOutboxProvider, epoch, emitter } = params;
  // The claim hash and the logs it is reconstructed from must be read at the
  // same block. Reading the hash at the head while scanning logs only up to
  // finalized makes reconstruction fail whenever an event lands in between.
  const headBlock = await veaOutboxProvider.getBlock("finalized");
  const claimHash = await veaOutbox.claimHashes(epoch, { blockTag: headBlock.number });
  if (claimHash === ethers.ZeroHash) return null;

  const claimFromLogs = await reconstructClaimFromLogs(params, claimHash, headBlock);
  const verifiedFromLogs = claimFromLogs && verifyClaimHash({ claim: claimFromLogs, claimHash });
  if (verifiedFromLogs) return verifiedFromLogs;

  const claimFromGraph = await reconstructClaimFromGraph(params);
  // Verify that this branch is never reached for an epoch where no claim was made
  if (!claimFromGraph) {
    emitter.emit(BotEvents.NO_CLAIM_FETCHED, epoch);
    throw new ClaimNotFoundError(epoch);
  }
  const verifiedFromGraph = verifyClaimHash({ claim: claimFromGraph, claimHash });
  if (verifiedFromGraph) return verifiedFromGraph;

  emitter.emit(BotEvents.CLAIM_MISMATCH, epoch);
  throw new ClaimNotFoundError(epoch);
};

type ClaimResolveState = {
  sendSnapshot: {
    status: boolean;
    txHash: string;
  };
  execution: {
    status: number; // 0: not ready, 1: ready, 2: executed
    txHash: string;
  };
};

export interface ClaimResolveStateParams {
  chainId: number;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  epoch: number;
  epochPeriod: number;
  headBlockTag?: "latest" | "finalized";
  fetchMessageStatus?: typeof getMessageStatus;
  fetchSentSnapshotData?: typeof getSentSnapshotData;
}

/**
 * Fetches the claim resolve state. Verifies claimHash from sent snapshot logs with Outbox claimHash. To call if claim is not yet resolved else an extra snapshot will be sent.
 * @param veaInbox VeaInbox contract instance
 * @param veaInboxProvider VeaInbox provider
 * @param veaOutbox VeaOutbox contract instance
 * @param veaOutboxProvider VeaOutbox provider
 * @param epoch epoch number of the claim to be fetched
 * @param fromBlock from block number
 * @param toBlock to block number
 * @param fetchMessageStatus function to fetch message status
 * @returns ClaimResolveState
 **/
const getClaimResolveState = async ({
  chainId,
  veaInbox,
  veaInboxProvider,
  veaOutbox,
  veaOutboxProvider,
  epoch,
  epochPeriod,
  headBlockTag = "finalized",
  fetchMessageStatus = getMessageStatus,
  fetchSentSnapshotData = getSentSnapshotData,
}: ClaimResolveStateParams): Promise<ClaimResolveState> => {
  let claimResolveState: ClaimResolveState = {
    sendSnapshot: {
      status: false,
      txHash: "",
    },
    execution: {
      status: 0,
      txHash: "",
    },
  };
  const outboxHeadBlock = await veaOutboxProvider.getBlock(headBlockTag);
  try {
    // SnapshotSent is emitted on the inbox chain, so its range must be expressed
    // in inbox block numbers. `sendSnapshot` requires
    // `_epoch < block.timestamp / epochPeriod`, so nothing can have been sent for
    // this epoch before (E+1)*P on the inbox clock.
    const inboxHeadBlock = await veaInboxProvider.getBlock(headBlockTag);
    const earliestSendBlock = await blockAtTimestamp({
      provider: veaInboxProvider,
      timestamp: (epoch + 1) * epochPeriod,
      headBlockTag,
    });
    const latestSnapshotSent = await findLatestLog({
      contract: veaInbox,
      filter: veaInbox.filters.SnapshotSent(epoch, null),
      fromBlock: Math.max(earliestSendBlock - CLAIM_WINDOW_PAD_BLOCKS, 0),
      toBlock: inboxHeadBlock.number,
    });
    if (latestSnapshotSent) {
      const sentSnapshotLogs = [latestSnapshotSent];
      // Add logic to check if the sent message has the actual claimHash or not
      const expectedClaimHash = await fetchSentSnapshotData(
        sentSnapshotLogs[0].transactionHash,
        veaInboxProvider,
        veaInbox.interface
      );
      const claimHash = await veaOutbox.claimHashes(epoch, { blockTag: outboxHeadBlock.number });

      if (claimHash === expectedClaimHash) {
        claimResolveState.sendSnapshot.status = true;
        claimResolveState.sendSnapshot.txHash = sentSnapshotLogs[0].transactionHash;
      } else {
        return claimResolveState;
      }
    } else {
      return claimResolveState;
    }
  } catch {
    const sentSnapshotFromGraph = await getSnapshotSentForEpoch(epoch, await veaInbox.getAddress(), chainId);
    if (sentSnapshotFromGraph) {
      const expectedClaimHash = await fetchSentSnapshotData(
        sentSnapshotFromGraph.txHash,
        veaInboxProvider,
        veaInbox.interface
      );
      const claimHash = await veaOutbox.claimHashes(epoch, { blockTag: outboxHeadBlock.number });
      if (claimHash === expectedClaimHash) {
        claimResolveState.sendSnapshot.status = true;
        claimResolveState.sendSnapshot.txHash = sentSnapshotFromGraph.txHash;
      } else {
        return claimResolveState;
      }
    } else {
      return claimResolveState;
    }
  }

  const status = await fetchMessageStatus(claimResolveState.sendSnapshot.txHash, veaInboxProvider, veaOutboxProvider);
  claimResolveState.execution.status = status;

  return claimResolveState;
};

/**
 * Check a reconstructed claim against the outbox's own claim hash.
 *
 * `honest` is not carried by any event, so it is recovered by trying each of the
 * three possible values. The *matching variant* is returned rather than a
 * boolean: the caller needs the struct that actually hashes to `claimHash`,
 * since every contract call taking a claim re-hashes it and reverts on mismatch.
 *
 * @returns The claim variant that hashes to `claimHash`, or null if none does
 */
const verifyClaimHash = ({ claim, claimHash }: { claim: ClaimStruct; claimHash: string }): ClaimStruct | null => {
  const candidates: ClaimStruct[] = [
    { ...claim, honest: ClaimHonestState.NONE },
    { ...claim, honest: ClaimHonestState.CLAIMER },
    { ...claim, honest: ClaimHonestState.CHALLENGER },
  ];
  return candidates.find((candidate) => hashClaim(candidate) === claimHash) ?? null;
};

/**
 * Hashes the claim data.
 *
 * @param claim - The claim data to be hashed
 *
 * @returns The hash of the claim data
 *
 */
const hashClaim = (claim: ClaimStruct) => {
  return ethers.solidityPackedKeccak256(
    ["bytes32", "address", "uint32", "uint32", "uint32", "uint8", "address"],
    [
      claim.stateRoot,
      claim.claimer,
      claim.timestampClaimed,
      claim.timestampVerification,
      claim.blocknumberVerification,
      claim.honest,
      claim.challenger,
    ]
  );
};

const getSentSnapshotData = async (
  txHash: string,
  provider: JsonRpcProvider,
  inboxInterface: any
): Promise<string | null> => {
  const tx = await provider.getTransaction(txHash);
  if (!tx) return null;

  // Parse the transaction calldata to identify function + args
  const parsed = inboxInterface.parseTransaction({ data: tx.data });
  const args = parsed.args;
  const claimTuple = args[1] as ClaimStruct;
  const expectedClaimHash = hashClaim(claimTuple);
  return expectedClaimHash;
};

export { getClaim, hashClaim, getClaimResolveState, ClaimHonestState };
