import request from "graphql-request";
import { ClaimNotFoundError, NoMessageSavedError } from "./errors";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { ethers } from "ethers";

interface ClaimData {
  epoch?: number;
  id: string;
  bridger: string;
  stateroot: string;
  timestamp: number;
  challenged: boolean;
  txHash: string;
  verification?: {
    startTimestamp: number;
    startTxHash: string;
  };
  challenge?: {
    challenger: string;
  };
}

const getOutboxSubgraphUrl = (chainId: number): string => {
  if (chainId === 11155111) {
    return process.env.VEAOUTBOX_SUBGRAPH_SEPOLIA || "";
  } else if (chainId === 10200) {
    return process.env.VEAOUTBOX_SUBGRAPH_CHIADO || "";
  }
};
const getInboxSubgraphUrl = (chainId: number): string => {
  // using destination chainId's for inbox
  if (chainId === 11155111 || chainId === 10200) {
    return process.env.VEAINBOX_SUBGRAPH_ARBSEPOLIA || "";
  }
};

/**
 * Fetches the claim data for a given epoch (used for claimer - happy path)
 * @param epoch
 * @returns ClaimData
 * */
const getClaimForEpoch = async (epoch: number, outbox: string, chainId: number): Promise<ClaimData | undefined> => {
  try {
    const subgraph = getOutboxSubgraphUrl(chainId);

    const result = await request(
      `${subgraph}`,
      `{
                        claims(where: {epoch: ${epoch}, outbox: "${outbox}"}) {
                        id
                        bridger
                        stateroot
                        timestamp
                        txHash
                        verification {
                          startTimestamp
                          startTxHash
                        }
                        challenge {
                          challenger
                        }
                      }
          }`
    );
    return result[`claims`][0];
  } catch (e) {
    console.log(e);
    throw new ClaimNotFoundError(epoch);
  }
};

/** Fetches the claims data for a given list of epochs (used for claimer - happy path)
 * @param epochs
 * @param outbox
 * @param chainId
 * @returns ClaimData[]
 * */
const getClaimsForEpochs = async (
  epochs: number[],
  outbox: string,
  chainId: number
): Promise<Map<number, ClaimStruct | null>> => {
  try {
    const subgraph = getOutboxSubgraphUrl(chainId);
    const epochsString = epochs.join(", ");
    const query = `{
      claims(where: {epoch_in: [${epochsString}], outbox: "${outbox}"}) {
        id
        bridger
        stateroot
        timestamp
        txHash
        verification {
          startTimestamp
          startTxHash
        }
        challenge {
          challenger
        }
        epoch
      }
    }`;

    const result: { claims: ClaimData[] } = await request(subgraph, query);
    // Map returned claims to corresponding epochs (some epochs may not have claims)
    const claimsByEpoch = new Map<number, ClaimStruct | null>();
    for (const claim of result.claims) {
      if (claim.stateroot === ethers.ZeroHash) {
        claimsByEpoch.set(claim.epoch, null);
        continue;
      }
      claimsByEpoch.set(claim.epoch, {
        stateRoot: claim.stateroot,
        claimer: claim.bridger,
        timestampClaimed: claim.timestamp,
        timestampVerification: claim.verification?.startTimestamp || 0,
        blocknumberVerification: 0, // This would require additional data to fill accurately
        honest: 0, // Placeholder, as this data isn't available in the current query
        challenger: claim.challenge?.challenger || ethers.ZeroAddress,
      });
    }
    return claimsByEpoch;
  } catch (e) {
    console.log(e);
    throw new Error(`Claims not found for epochs: ${epochs.join(", ")}`);
  }
};

/**
 * Fetches the last claimed epoch (used for claimer - happy path)
 * @returns ClaimData
 */
const getLastClaimedEpoch = async (outbox: string, chainId: number): Promise<ClaimData> => {
  const subgraph = getOutboxSubgraphUrl(chainId);
  try {
    const result = await request(
      `${subgraph}`,
      `{
          claims(first:1, orderBy:timestamp, orderDirection:desc, where: {outbox: "${outbox}"}) {
                        id
                        bridger
                        stateroot
                        timestamp
                        challenged
                        txHash
                        }
          
        }`
    );
    return result[`claims`][0];
  } catch (e) {
    console.log(e);
    throw new ClaimNotFoundError(-1);
  }
};

type VerificationData = {
  startTimestamp: number | null;
  startTxHash: string | null;
};

/**
 * Fetches the verification data for a given claim (used for claimer - happy path)
 * @param claimId
 * @returns VerificationData
 */
const getVerificationForClaim = async (claimId: string, chainId: number): Promise<VerificationData | undefined> => {
  try {
    const subgraph = getOutboxSubgraphUrl(chainId);
    const result = await request(
      `${subgraph}`,
      `{
          verifications(where: {claim: "${claimId}"}) {
            startTimestamp
            startTxHash
          }
        }`
    );
    return result[`verifications`][0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

/**
 * Fetches the challenger data for a given claim (used for validator - unhappy path)
 * @param claimId
 * @returns challenger address
 * */
const getChallengerForClaim = async (claimId: string, chainId: number): Promise<{ challenger: string } | undefined> => {
  try {
    const subgraph = getOutboxSubgraphUrl(chainId);
    const result = await request(
      `${subgraph}`,
      `{
          challenges(where: {claim: "${claimId}"}) {
            challenger
          }
        }`
    );
    return result[`challenges`][0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

type SenSnapshotResponse = {
  snapshots: {
    fallback: { txHash: string }[];
  }[];
};

/**
 * Fetches the snapshot data for a given epoch (used for validator - happy path)
 * @param epoch
 * @returns snapshot data
 */
const getSnapshotSentForEpoch = async (
  epoch: number,
  veaInbox: string,
  chainId: number
): Promise<{ txHash: string } | undefined> => {
  try {
    const subgraph = getInboxSubgraphUrl(chainId);

    const result: SenSnapshotResponse = await request(
      `${subgraph}`,
      `{
          snapshots(where: {epoch: ${epoch}, inbox_: { id: "${veaInbox}" }}) {
            fallback(orderBy: timestamp, orderDirection: desc){
              txHash
            }
          }
        }`
    );
    return result.snapshots[0].fallback[0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

type LastMessageSavedResponse = {
  messages: {
    id: string;
    snapshot: {
      stateRoot: string;
    };
  }[];
};

/**
 * Fetches the last message saved for a given inbox (used for validator - happy path)
 * @param veaInbox
 * @returns message id
 */
const getLastMessageSaved = async (
  veaInbox: string,
  chainId: number
): Promise<{ id: string; stateRoot: string } | null> => {
  const subgraph = getInboxSubgraphUrl(chainId);
  try {
    const result: LastMessageSavedResponse = await request(
      `${subgraph}`,
      `{
      messages(first:1, orderBy:timestamp,orderDirection:desc, where:{inbox:"${veaInbox.toLowerCase()}"}) {
        id
        snapshot{
          stateRoot
        }
      }
    }`
    );
    if (result.messages.length < 1) return null;
    return { id: result.messages[0].id, stateRoot: result.messages[0].snapshot.stateRoot };
  } catch (e) {
    console.log(e);
    throw new NoMessageSavedError(veaInbox);
  }
};

export {
  getClaimForEpoch,
  getLastClaimedEpoch,
  getVerificationForClaim,
  getChallengerForClaim,
  getSnapshotSentForEpoch,
  getLastMessageSaved,
  ClaimData,
  getClaimsForEpochs,
};
