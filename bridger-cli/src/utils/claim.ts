import { ClaimData, getClaimForEpoch } from "./graphQueries";
import { ethers } from "ethers";
import { ClaimNotFoundError } from "./errors";

type ClaimStruct = {
  stateRoot: string;
  claimer: `0x${string}`;
  timestampClaimed: number;
  timestampVerification: number;
  blocknumberVerification: number;
  honest: number;
  challenger: `0x${string}`;
};

/**
 * Fetches the claim data for a given epoch.
 *
 * @param veaOutbox - The VeaOutbox contract instance
 * @param epoch - The epoch number for which the claim is needed
 *
 * @returns The claim data for the given epoch
 *
 * @example
 * const claim = await fetchClaim(veaOutbox, 240752);
 */

const fetchClaim = async (
  veaOutbox: any,
  epoch: number,
  fetchClaimForEpoch: typeof getClaimForEpoch = getClaimForEpoch
): Promise<ClaimStruct> => {
  let claimData: ClaimData | undefined = await fetchClaimForEpoch(epoch);
  // TODO: Check for logs block range Rpc dependency, if needed used claimEpochBlock
  if (claimData === undefined) {
    // Initialize claimData as an empty object
    claimData = {} as ClaimData;
    const claimLogs = await veaOutbox.queryFilter(veaOutbox.filters.Claimed(null, epoch, null));
    if (claimLogs.length === 0) {
      throw new ClaimNotFoundError(epoch);
    }
    claimData.bridger = `0x${claimLogs[0].topics[1].slice(26)}`;
    claimData.stateroot = claimLogs[0].data;
    claimData.timestamp = (await veaOutbox.provider.getBlock(claimLogs[0].blockNumber)).timestamp;
  }
  let claim: ClaimStruct = {
    stateRoot: claimData.stateroot,
    claimer: claimData.bridger as `0x${string}`,
    timestampClaimed: claimData.timestamp,
    timestampVerification: 0,
    blocknumberVerification: 0,
    honest: 0,
    challenger: ethers.constants.AddressZero,
  };
  const [verifyLogs, challengeLogs] = await Promise.all([
    veaOutbox.queryFilter(veaOutbox.filters.VerificationStarted(epoch)),
    veaOutbox.queryFilter(veaOutbox.filters.Challenged(epoch)),
  ]);

  if (verifyLogs.length > 0) {
    const verificationStartBlock = await veaOutbox.provider.getBlock(verifyLogs[0].blockHash);
    claim.timestampVerification = verificationStartBlock.timestamp;
    claim.blocknumberVerification = verificationStartBlock.number;
  }

  if (challengeLogs.length > 0) {
    claim.challenger = challengeLogs[0].args.challenger;
  }

  return claim;
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
const hashClaim = (claim) => {
  return ethers.utils.solidityKeccak256(
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

export { ClaimStruct, fetchClaim, hashClaim };
