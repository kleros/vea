import request from "graphql-request";
import { ClaimNotFoundError, NoMessageSavedError } from "./errors";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { ethers } from "ethers";

interface ClaimData {
  epoch?: number;
  id: string;
  bridger: string;
  stateRoot: string;
  timestamp: number;
  challenged: boolean;
  txHash: string;
  verification?: {
    startTimestamp: number;
    startTxHash: string;
  }[];
  challenge?: {
    challenger: string;
  }[];
}

/**
 * Fetches the claim data for a given epoch (used for claimer - happy path)
 * @param epoch
 * @returns ClaimData
 * */
const getClaimForEpoch = async (epoch: number, outbox: string, chainId: number): Promise<ClaimData | undefined> => {
  try {
    const subgraph = process.env.ENVIO_URL!;

    const result = await request(
      `${subgraph}`,
      `{
                        Claim(where: {epoch: {_eq: ${epoch}}, outbox: {id: {_eq: "${outbox}"}}}) {
                        id
                        bridger
                        stateRoot
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
    return result[`Claim`][0];
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
    const subgraph = process.env.ENVIO_URL!;
    const epochsString = epochs.join(", ");
    const query = `{
      Claim(where: {epoch: {_in: [${epochsString}]}, outbox: {id: {_eq: "${outbox}"}}}) {
        id
        bridger
        stateRoot
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

    const result: { Claim: ClaimData[] } = await request(subgraph, query);
    // Map returned claims to corresponding epochs (some epochs may not have claims)
    const claimsByEpoch = new Map<number, ClaimStruct | null>();
    for (const claim of result.Claim) {
      if (claim.stateRoot === ethers.ZeroHash) {
        claimsByEpoch.set(claim.epoch, null);
        continue;
      }
      claimsByEpoch.set(claim.epoch, {
        stateRoot: claim.stateRoot,
        claimer: claim.bridger,
        timestampClaimed: claim.timestamp,
        timestampVerification: claim.verification?.[0]?.startTimestamp || 0,
        blocknumberVerification: 0, // This would require additional data to fill accurately
        honest: 0, // Placeholder, as this data isn't available in the current query
        challenger: claim.challenge?.[0]?.challenger || ethers.ZeroAddress,
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
  const subgraph = process.env.ENVIO_URL!;
  try {
    const result = await request(
      `${subgraph}`,
      `{
          Claim(limit:1, order_by:{timestamp:desc}, where: {outbox: {id: {_eq: "${outbox}"}}}) {
                        id
                        bridger
                        stateRoot
                        timestamp
                        challenged
                        txHash
                        }

        }`
    );
    return result[`Claim`][0];
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
    const subgraph = process.env.ENVIO_URL!;
    const result = await request(
      `${subgraph}`,
      `{
          Verification(where: {claim: {id: {_eq: "${claimId}"}}}) {
            startTimestamp
            startTxHash
          }
        }`
    );
    return result[`Verification`][0];
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
    const subgraph = process.env.ENVIO_URL!;
    const result = await request(
      `${subgraph}`,
      `{
          Challenge(where: {claim: {id: {_eq: "${claimId}"}}}) {
            challenger
          }
        }`
    );
    return result[`Challenge`][0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

type SenSnapshotResponse = {
  Snapshot: {
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
    const subgraph = process.env.ENVIO_URL!;

    const result: SenSnapshotResponse = await request(
      `${subgraph}`,
      `{
          Snapshot(where: {epoch: {_eq: ${epoch}}, inbox: { id: { _eq: "${veaInbox}" } }}) {
            fallback(order_by: {timestamp: desc}){
              txHash
            }
          }
        }`
    );
    return result.Snapshot[0].fallback[0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

type LastMessageSavedResponse = {
  Message: {
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
  const subgraph = process.env.ENVIO_URL!;
  try {
    const result: LastMessageSavedResponse = await request(
      `${subgraph}`,
      `{
      Message(limit:1, order_by:{timestamp:desc}, where:{inbox:{id:{_eq:"${veaInbox}"}}}) {
        id
        snapshot{
          stateRoot
        }
      }
    }`
    );
    if (result.Message.length < 1) return null;
    return { id: result.Message[0].id, stateRoot: result.Message[0].snapshot.stateRoot };
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
