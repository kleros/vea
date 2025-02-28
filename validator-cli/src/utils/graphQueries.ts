import request from "graphql-request";

interface ClaimData {
  id: string;
  bridger: string;
  stateroot: string;
  timestamp: number;
  challenged: boolean;
  txHash: string;
}

/**
 * Fetches the claim data for a given epoch (used for claimer - happy path)
 * @param epoch
 * @returns ClaimData
 * */
const getClaimForEpoch = async (epoch: number): Promise<ClaimData | undefined> => {
  try {
    const subgraph = process.env.VEAOUTBOX_SUBGRAPH;

    const result = await request(
      `${subgraph}`,
      `{
                        claims(where: {epoch: ${epoch}}) {
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
    return undefined;
  }
};

/**
 * Fetches the last claimed epoch (used for claimer - happy path)
 * @returns ClaimData
 */
const getLastClaimedEpoch = async (): Promise<ClaimData> => {
  const subgraph = process.env.VEAOUTBOX_SUBGRAPH;

  const result = await request(
    `${subgraph}`,
    `{
          claims(first:1, orderBy:timestamp, orderDirection:desc){
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
};

export { getClaimForEpoch, getLastClaimedEpoch, ClaimData };
