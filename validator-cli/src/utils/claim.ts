import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { ethers } from "ethers";
import { ClaimNotFoundError } from "./errors";

const fetchClaim = async (veaOutbox: any, epoch: number): Promise<ClaimStruct | null> => {
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
    veaOutbox.queryFilter(veaOutbox.filters.Claimed(null, epoch, null)),
    veaOutbox.queryFilter(veaOutbox.filters.Challenged(epoch, null)),
    veaOutbox.queryFilter(veaOutbox.filters.VerificationStarted(epoch)),
  ]);
  if (claimLogs.length === 0) throw new ClaimNotFoundError(epoch);
  claim.stateRoot = claimLogs[0].data;
  claim.claimer = `0x${claimLogs[0].topics[1].slice(26)}`;
  claim.timestampClaimed = (await veaOutbox.provider.getBlock(claimLogs[0].blockNumber)).timestamp;

  if (verificationLogs.length > 0) {
    claim.timestampVerification = (await veaOutbox.provider.getBlock(verificationLogs[0].blockNumber)).timestamp;
    claim.blocknumberVerification = verificationLogs[0].blockNumber;
  }
  if (challengeLogs.length > 0) {
    claim.challenger = "0x" + challengeLogs[0].topics[2].substring(26);
  }

  if (hashClaim(claim) == claimHash) {
    return claim;
  } else {
    throw new ClaimNotFoundError(epoch);
  }
};

/**
 * Hashes the claim data.
 *
 * @param claim - The claim data to be hashed
 *
 * @returns The hash of the claim data
 *
 * @example
 * const claimHash = hashClaim(claim);
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

export { fetchClaim, hashClaim };
