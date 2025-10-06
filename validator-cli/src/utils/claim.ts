import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { VeaInboxArbToEth__factory } from "@kleros/vea-contracts/typechain-types";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers, Interface } from "ethers";
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
  chainId: number;
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
  chainId,
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
  console.log("CLAIM HASH FROM CONTRACT", claimHash);
  try {
    const [claimLogs, challengeLogs, verificationLogs] = await Promise.all([
      veaOutbox.queryFilter(veaOutbox.filters.Claimed(null, epoch, null), fromBlock, toBlock),
      veaOutbox.queryFilter(veaOutbox.filters.Challenged(epoch, null), fromBlock, toBlock),
      veaOutbox.queryFilter(veaOutbox.filters.VerificationStarted(epoch), fromBlock, toBlock),
    ]);
    console.log("CLAIM LOGS", claimLogs);
    claim.stateRoot = claimLogs[0].data;
    claim.claimer = `0x${claimLogs[0].topics[1].slice(26)}`;
    claim.timestampClaimed = (await veaOutboxProvider.getBlock(claimLogs[0].blockNumber)).timestamp;
    if (verificationLogs.length > 0) {
      claim.blocknumberVerification = verificationLogs[0].blockNumber;
      claim.timestampVerification = (await veaOutboxProvider.getBlock(verificationLogs[0].blockNumber)).timestamp;
    }
    if (challengeLogs.length > 0) claim.challenger = "0x" + challengeLogs[0].topics[2].substring(26);
  } catch {
    const claimFromGraph = await fetchClaimForEpoch(epoch, await veaOutbox.getAddress(), chainId);
    if (!claimFromGraph) throw new ClaimNotFoundError(epoch);
    const [verificationFromGraph, challengeFromGraph] = await Promise.all([
      fetchVerificationForClaim(claimFromGraph.id, chainId),
      fetchChallengerForClaim(claimFromGraph.id, chainId),
    ]);
    claim.stateRoot = claimFromGraph.stateroot;
    claim.claimer = claimFromGraph.bridger;
    claim.timestampClaimed = claimFromGraph.timestamp;
    if (verificationFromGraph?.startTimestamp) {
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

export interface ClaimResolveStateParams {
  chainId: number;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  epoch: number;
  fromBlock: number;
  toBlock: number | string;
  fetchMessageStatus?: typeof getMessageStatus;
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
  fromBlock,
  toBlock,
  fetchMessageStatus = getMessageStatus,
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
  try {
    const sentSnapshotLogs = await veaInbox.queryFilter(veaInbox.filters.SnapshotSent(epoch, null), fromBlock, toBlock);
    if (sentSnapshotLogs.length > 0) {
      sentSnapshotLogs.sort((a, b) =>
        a.blockNumber !== b.blockNumber ? b.blockNumber - a.blockNumber : b.logIndex - a.logIndex
      );
      // Add logic to check if the sent message has the actual claimHash or not
      const expectedClaimHash = await getSentSnapshotData(
        sentSnapshotLogs[0].transactionHash,
        veaInboxProvider,
        veaInbox.interface
      );
      const claimHash = await veaOutbox.claimHashes(epoch);
      console.log("CLAIM HASH FROM CONTRACT", claimHash);
      console.log("EXPECTED CLAIM HASH FROM SENT SNAPSHOT", expectedClaimHash);
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
      const expectedClaimHash = await getSentSnapshotData(
        sentSnapshotFromGraph.txHash,
        veaInboxProvider,
        veaInbox.interface
      );
      const claimHash = await veaOutbox.claimHashes(epoch);
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

const getSentSnapshotData = async (txHash: string, provider: JsonRpcProvider, inboxInterface: any): Promise<string> => {
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
