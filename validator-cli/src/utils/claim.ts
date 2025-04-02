import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
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

enum ClaimHonestState {
  NONE = 0,
  CLAIMER = 1,
  CHALLENGER = 2,
}

interface ClaimParams {
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  epoch: number;
  fromBlock: number;
  toBlock: number | string;
  fetchClaimForEpoch?: typeof getClaimForEpoch;
  fetchVerificationForClaim?: typeof getVerificationForClaim;
  fetchChallengerForClaim?: typeof getChallengerForClaim;
}

/**
 *
 * @param veaOutbox VeaOutbox contract instance
 * @param epoch epoch number of the claim to be fetched
 * @returns claim type of ClaimStruct
 */
const getClaim = async ({
  veaOutbox,
  veaOutboxProvider,
  epoch,
  fromBlock,
  toBlock,
  fetchChallengerForClaim = getChallengerForClaim,
  fetchClaimForEpoch = getClaimForEpoch,
  fetchVerificationForClaim = getVerificationForClaim,
}: ClaimParams): Promise<ClaimStruct | null> => {
  let claim: ClaimStruct = {
    stateRoot: ethers.ZeroHash,
    claimer: ethers.ZeroAddress,
    timestampClaimed: 0,
    timestampVerification: 0,
    blocknumberVerification: 0,
    honest: 0,
    challenger: ethers.ZeroAddress,
  };
  const claimHash = await veaOutbox.claimHashes(epoch);
  if (claimHash === ethers.ZeroHash) return null;

  try {
    const [claimLogs, challengeLogs, verificationLogs] = await Promise.all([
      veaOutbox.queryFilter(veaOutbox.filters.Claimed(null, epoch, null), fromBlock, toBlock),
      veaOutbox.queryFilter(veaOutbox.filters.Challenged(epoch, null), fromBlock, toBlock),
      veaOutbox.queryFilter(veaOutbox.filters.VerificationStarted(epoch), fromBlock, toBlock),
    ]);
    claim.stateRoot = claimLogs[0].data;
    claim.claimer = `0x${claimLogs[0].topics[1].slice(26)}`;
    claim.timestampClaimed = (await veaOutboxProvider.getBlock(claimLogs[0].blockNumber)).timestamp;
    if (verificationLogs.length > 0) {
      claim.blocknumberVerification = verificationLogs[0].blockNumber;
      claim.timestampVerification = (await veaOutboxProvider.getBlock(verificationLogs[0].blockNumber)).timestamp;
    }
    if (challengeLogs.length > 0) claim.challenger = "0x" + challengeLogs[0].topics[2].substring(26);
  } catch (error) {
    const claimFromGraph = await fetchClaimForEpoch(epoch, await veaOutbox.getAddress());
    const [verificationFromGraph, challengeFromGraph] = await Promise.all([
      fetchVerificationForClaim(claimFromGraph.id),
      fetchChallengerForClaim(claimFromGraph.id),
    ]);
    claim.stateRoot = claimFromGraph.stateroot;
    claim.claimer = claimFromGraph.bridger;
    claim.timestampClaimed = claimFromGraph.timestamp;
    if (verificationFromGraph && verificationFromGraph.startTimestamp) {
      claim.timestampVerification = verificationFromGraph.startTimestamp;
      const startVerificationTxHash = verificationFromGraph.startTxHash;
      const txReceipt = await veaOutboxProvider.getTransactionReceipt(startVerificationTxHash);
      claim.blocknumberVerification = txReceipt.blockNumber;
    }
    if (challengeFromGraph) claim.challenger = challengeFromGraph.challenger;
  }

  if (hashClaim(claim) == claimHash) {
    return claim;
  }
  claim.honest = ClaimHonestState.CLAIMER; // Assuming claimer is honest
  if (hashClaim(claim) == claimHash) {
    return claim;
  }
  claim.honest = ClaimHonestState.CHALLENGER; // Assuming challenger is honest
  if (hashClaim(claim) == claimHash) {
    return claim;
  }
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

/**
 * Fetches the claim resolve state.
 * @param veaInbox VeaInbox contract instance
 * @param veaInboxProvider VeaInbox provider
 * @param veaOutboxProvider VeaOutbox provider
 * @param epoch epoch number of the claim to be fetched
 * @param fromBlock from block number
 * @param toBlock to block number
 * @param fetchMessageStatus function to fetch message status
 * @returns ClaimResolveState
 **/
const getClaimResolveState = async (
  veaInbox: any,
  veaInboxProvider: JsonRpcProvider,
  veaOutboxProvider: JsonRpcProvider,
  epoch: number,
  fromBlock: number,
  toBlock: number | string,
  fetchMessageStatus: typeof getMessageStatus = getMessageStatus
): Promise<ClaimResolveState> => {
  var claimResolveState: ClaimResolveState;

  try {
    const sentSnapshotLogs = await veaInbox.queryFilter(veaInbox.filters.SnapshotSent(epoch, null), fromBlock, toBlock);
    claimResolveState.sendSnapshot.status = true;
    claimResolveState.sendSnapshot.txHash = sentSnapshotLogs[0].transactionHash;
  } catch (error) {
    const sentSnapshotFromGraph = await getSnapshotSentForEpoch(epoch, await veaInbox.getAddress());
    console.log(sentSnapshotFromGraph);
    if (sentSnapshotFromGraph) {
      claimResolveState.sendSnapshot.status = true;
      claimResolveState.sendSnapshot.txHash = sentSnapshotFromGraph.txHash;
    } else {
      return claimResolveState;
    }
  }

  const status = await fetchMessageStatus(claimResolveState.sendSnapshot.txHash, veaInboxProvider, veaOutboxProvider);
  claimResolveState.execution.status = status;

  return claimResolveState;
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

export { getClaim, hashClaim, getClaimResolveState, ClaimHonestState };
