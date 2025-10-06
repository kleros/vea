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

type SnapshotSavedResponse = {
  snapshots: {
    messages: {
      id: string;
    }[];
  }[];
};

/**
 * Fetches the last message saved for a given inbox (used for validator - happy path)
 * @param veaInbox
 * @returns message id
 */
const getLastMessageSaved = async (veaInbox: string, chainId: number): Promise<string> => {
  const subgraph = getInboxSubgraphUrl(chainId);
  const result: SnapshotSavedResponse = await request(
    `${subgraph}`,
    `{
      snapshots(first:2, orderBy:timestamp,orderDirection:desc, where:{inbox:"${veaInbox}"}) {
        messages(first: 1,orderBy:timestamp,orderDirection:desc){
          id 
        }
      }
    }`
  );
  if (result.snapshots.length < 2 || result.snapshots[1].messages.length === 0) return;
  return result.snapshots[1].messages[0].id;
};

export {
  getClaimForEpoch,
  getLastClaimedEpoch,
  getVerificationForClaim,
  getChallengerForClaim,
  getSnapshotSentForEpoch,
  getLastMessageSaved,
  ClaimData,
};
