import request from "graphql-request";

interface ClaimData {
  id: string;
  bridger: string;
  stateroot: string;
  timestamp: number;
  challenged: boolean;
  txHash: string;
}

const getClaimForEpoch = async (chainid: number, epoch: number): Promise<ClaimData> => {
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

const getVerificationStatus = async (chainid: number, epoch: number): Promise<ClaimData> => {
  try {
    const subgraph = process.env.VEAOUTBOX_SUBGRAPH;

    const result = await request(
      `${subgraph}`,
      `{
	        verifications(where:{claim_:{epoch:${epoch}}}){
                claim{
                 stateroot
                epoch
                }
            timestamp
            id
            }
        }`
    );
    return result[`verifications`][0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

const getLastClaimedEpoch = async (chainid: number): Promise<ClaimData> => {
  try {
    const subgraph = process.env.VEAOUTBOX_SUBGRAPH;

    const result = await request(
      `${subgraph}`,
      `{
          claims(first:1, orderBy:timestamp, orderDirection:desc){
          id
                        bridger
                        stateroot
                        timestamp
                        verification{
                          timestamp
                        }
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

export { getClaimForEpoch, getVerificationStatus, getLastClaimedEpoch, ClaimData };
