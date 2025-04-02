import request from "graphql-request";
import { ClaimNotFoundError } from "./errors";

interface ClaimData {
  id: string;
  bridger: string;
  stateroot: string;
  timestamp: number;
  challenged: boolean;
  txHash: string;
  verification: {
    timestamp: number;
  };
  challenge: {
    challenger: string;
  };
}

/**
 * Fetches the claim data for a given epoch (used for claimer - happy path)
 * @param epoch
 * @returns ClaimData
 * */
const getClaimForEpoch = async (epoch: number, outbox: string): Promise<ClaimData | undefined> => {
  try {
    const subgraph = process.env.VEAOUTBOX_SUBGRAPH;

    const result = await request(
      `${subgraph}`,
      `{
                        claims(where: {epoch: ${epoch}, outbox: "${outbox}"}) {
                        id
                        bridger
                        stateroot
                        timestamp
                        txHash
                        challenged
                      }
          }`
    );
    return result[`claims`][0];
  } catch (e) {
    console.log(e);
    throw new ClaimNotFoundError(epoch);
  }
};

/**
 * Fetches the last claimed epoch (used for claimer - happy path)
 * @returns ClaimData
 */
const getLastClaimedEpoch = async (outbox: string): Promise<ClaimData> => {
  const subgraph = process.env.VEAOUTBOX_SUBGRAPH;
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

const getVerificationForClaim = async (claimId: string): Promise<VerificationData | undefined> => {
  try {
    const subgraph = process.env.VEAOUTBOX_SUBGRAPH;
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

const getChallengerForClaim = async (claimId: string): Promise<{ challenger: string } | undefined> => {
  try {
    const subgraph = process.env.VEAOUTBOX_SUBGRAPH;
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

const getSnapshotSentForEpoch = async (epoch: number, veaInbox: any): Promise<{ txHash: string }> => {
  try {
    const subgraph = process.env.VEAINBOX_SUBGRAPH;
    const result = await request(
      `${subgraph}`,
      `{
          snapshots(where: {epoch: "${epoch}", inbox: "${veaInbox}"}) {
            fallback{
              txHash
            }
          }
        }`
    );
    return result[`fallback`][0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

export {
  getClaimForEpoch,
  getLastClaimedEpoch,
  getVerificationForClaim,
  getChallengerForClaim,
  getSnapshotSentForEpoch,
  ClaimData,
};
