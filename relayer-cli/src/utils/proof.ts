import request from "graphql-request";

const getMessageDataToRelay = async (chainid: number, nonce: number) => {
  try {
    const subgraph = getSubgraph(chainid);

    const result = await request(
      `https://api.studio.thegraph.com/query/67213/${subgraph}/version/latest`,
      `{
                messageSents(first: 5, where: {nonce: ${nonce}}) {
                nonce
                to {
                    id
                }
                data
                }
            }`
    );

    return [result[`messageSents`][0].to.id, result[`messageSents`][0].data];
  } catch (e) {
    console.log(e);
  }
};

const getProofAtCount = async (chainid: number, nonce: number, count: number): Promise<string[]> => {
  const proofIndices = getProofIndices(nonce, count);

  if (proofIndices.length == 0) return [];

  let query = "{";
  for (let i = 0; i < proofIndices.length; i++) {
    query += `layer${i}: nodes(first: 1, where: {id: "${proofIndices[i]}"}) {
              hash
            }`;
  }
  query += "}";

  try {
    const subgraph = getSubgraph(chainid);

    const result = await request(`https://api.studio.thegraph.com/query/67213/${subgraph}/version/latest`, query);

    const proof = [];

    for (let i = 0; i < proofIndices.length; i++) {
      proof.push(result[`layer${i}`][0].hash);
    }

    return proof;
  } catch (e) {
    console.log(e);
    return [];
  }
};

const getProofIndices = (nonce: number, count: number) => {
  let proof = [];
  if (nonce >= count) return proof;

  const treeDepth = Math.ceil(Math.log2(count));

  for (let i = 0; i <= treeDepth; i++) {
    if (i == 0 && (nonce ^ 1) < count) proof.push((nonce ^ 1).toString()); // sibling
    else {
      const low = ((nonce >> i) ^ 1) << i;
      const high = Math.min(low + Math.pow(2, i) - 1, count - 1);
      if (low < count - 1) proof.push(low.toString() + "," + high.toString());
      else if (low == count - 1) proof.push(low.toString());
    }
  }

  return proof;
};

const getSubgraph = (chainid: number): string => {
  switch (chainid) {
    case 11155111:
      return "vea-inbox-arb-sepolia-devnet";
    default:
      throw new Error("Invalid chainid");
  }
};

export { getProofAtCount, getSubgraph, getMessageDataToRelay };
