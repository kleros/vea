import { ClaimData, getClaimForEpoch } from "./graphQueries";
import { ethers } from "ethers";
import { getBlockNumberFromEpoch } from "./epochHandler";

type ClaimStruct = {
  stateRoot: string;
  claimer: `0x${string}`;
  timestampClaimed: number;
  timestampVerification: number;
  blocknumberVerification: number;
  honest: number;
  challenger: `0x${string}`;
};

const fetchClaim = async (
  veaOutbox,
  epoch,
  chainId,
  fetchClaimForEpoch: typeof getClaimForEpoch = getClaimForEpoch
): Promise<ClaimStruct> => {
  let claimData: ClaimData | undefined = await fetchClaimForEpoch(epoch);
  // ToDo: Check for logs block range Rpc dependency, if needed used claimEpochBlock
  // let claimEpochBlock = await getBlockNumberFromEpoch(veaOutbox.provider, epoch, chainId);
  if (claimData === undefined) {
    // Initialize claimData as an empty object
    claimData = {} as ClaimData;
    const claimLogs = await veaOutbox.queryFilter(veaOutbox.filters.Claimed(null, epoch, null));
    if (claimLogs.length === 0) {
      throw new Error(`No claim found for epoch ${epoch}`);
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
  const verifyLogs = await veaOutbox.queryFilter(veaOutbox.filters.VerificationStarted(epoch));
  if (verifyLogs.length > 0) {
    const verificationStartBlock = await veaOutbox.provider.getBlock(verifyLogs[0].blockHash);
    claim.timestampVerification = verificationStartBlock.timestamp;
    claim.blocknumberVerification = verificationStartBlock.number;
  }
  const challengeLogs = await veaOutbox.queryFilter(veaOutbox.filters.Challenged(epoch));
  if (challengeLogs.length > 0) {
    claim.challenger = challengeLogs[0].args.challenger;
  }

  return claim;
};

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
