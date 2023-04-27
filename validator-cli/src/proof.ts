import request from "graphql-request";

const relay = async (arbProvider, arbSigner, ethProvider, ethSigner) => {};

const getMessageDataToRelay = async (nonce: number) => {
  try {
    const result = await request(
      "https://api.thegraph.com/subgraphs/name/shotaronowhere/vea-inbox-arbitrum",
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

const getProof = async (nonce: number) => {
  try {
    const result = await request(
      "https://api.thegraph.com/subgraphs/name/shotaronowhere/vea-inbox-arbitrum            ",
      `{
                snapshotSaveds(first: 1, orderBy: count) {
                  count
                }
              }`
    );
    return await getProofAtCount(nonce, Number(result["snapshotSaveds"][0].count));
  } catch (e) {
    console.log(e);
    return [];
  }
};

const getProofAtCount = async (nonce: number, count: number) => {
  const proofIndices = getProofIndices(nonce, count);

  let query = "{";
  for (let i = 0; i < proofIndices.length; i++) {
    query += `layer${i}: nodes(first: 1, where: {id: "${proofIndices[i]}"}) {
              hash
            }`;
  }
  query += "}";

  try {
    const result = await request(
      "https://api.thegraph.com/subgraphs/name/shotaronowhere/vea-inbox-arbitrum            ",
      query
    );

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

  for (let i = 0; i < treeDepth; i++) {
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

export { getProof, getProofAtCount, getMessageDataToRelay };
