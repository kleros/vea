import request from "graphql-request";

async function getVeaMsgTrnx(nonce: number, inboxAddress: string) {
  console.log(`Fetching transaction hashes for nonce ${nonce} from inbox ${inboxAddress}`);
  try {
    const subgraph = process.env.RELAYER_SUBGRAPH;
    const query = `{messageSents(first: 1, where: {nonce: ${nonce}, inbox: "${inboxAddress}"}) {
    id
    transactionHash
  }}`;
    const result = (await request(`https://api.studio.thegraph.com/query/${subgraph}`, query)) as {
      messageSents: { id: string; transactionHash: string }[];
    };
    return result.messageSents.map((trnx) => trnx.transactionHash);
  } catch (e) {
    console.log(e);
    return [];
  }
}

export { getVeaMsgTrnx };
