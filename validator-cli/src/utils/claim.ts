import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { ClaimNotFoundError } from "./errors";
import { getMessageStatus } from "./arbMsgExecutor";

/**
 *
 * @param veaOutbox VeaOutbox contract instance
 * @param epoch epoch number of the claim to be fetched
 * @returns claim type of ClaimStruct
 */

enum ClaimHonestState {
  NONE = 0,
  CLAIMER = 1,
  CHALLENGER = 2,
}
const getClaim = async (
  veaOutbox: any,
  veaOutboxProvider: JsonRpcProvider,
  epoch: number,
  fromBlock: number,
  toBlock: number | string
): Promise<ClaimStruct | null> => {
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

  const [claimLogs, challengeLogs, verificationLogs] = await Promise.all([
    veaOutbox.queryFilter(veaOutbox.filters.Claimed(null, epoch, null), fromBlock, toBlock),
    veaOutbox.queryFilter(veaOutbox.filters.Challenged(epoch, null), fromBlock, toBlock),
    veaOutbox.queryFilter(veaOutbox.filters.VerificationStarted(epoch), fromBlock, toBlock),
  ]);

  if (claimLogs.length === 0) throw new ClaimNotFoundError(epoch);

  claim.stateRoot = claimLogs[0].data;
  claim.claimer = `0x${claimLogs[0].topics[1].slice(26)}`;
  claim.timestampClaimed = (await veaOutboxProvider.getBlock(claimLogs[0].blockNumber)).timestamp;

  if (verificationLogs.length > 0) {
    claim.timestampVerification = (await veaOutboxProvider.getBlock(verificationLogs[0].blockNumber)).timestamp;
    claim.blocknumberVerification = verificationLogs[0].blockNumber;
  }
  if (challengeLogs.length > 0) {
    claim.challenger = "0x" + challengeLogs[0].topics[2].substring(26);
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

const getClaimResolveState = async (
  veaInbox: any,
  veaInboxProvider: JsonRpcProvider,
  veaOutboxProvider: JsonRpcProvider,
  epoch: number,
  fromBlock: number,
  toBlock: number | string,
  fetchMessageStatus: typeof getMessageStatus = getMessageStatus
): Promise<ClaimResolveState> => {
  const sentSnapshotLogs = await veaInbox.queryFilter(veaInbox.filters.SnapshotSent(epoch, null), fromBlock, toBlock);

  const claimResolveState: ClaimResolveState = {
    sendSnapshot: { status: false, txHash: "" },
    execution: { status: 0, txHash: "" },
  };

  if (sentSnapshotLogs.length === 0) return claimResolveState;

  claimResolveState.sendSnapshot.status = true;
  claimResolveState.sendSnapshot.txHash = sentSnapshotLogs[0].transactionHash;

  const status = await fetchMessageStatus(sentSnapshotLogs[0].transactionHash, veaInboxProvider, veaOutboxProvider);
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

export { getClaim, hashClaim, getClaimResolveState };
