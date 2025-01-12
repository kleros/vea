import request from "graphql-request";
import { getInboxSubgraph } from "../consts/bridgeRoutes";

/**
 * Get the message data to relay from the subgraph
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the message
 * @returns The message id and data to relay
 */
const getMessageDataToRelay = async (chainId: number, nonce: number, requestGraph: typeof request = request) => {
  try {
    const subgraph = getInboxSubgraph(chainId);

    const result = await requestGraph(
      `https://api.studio.thegraph.com/query/${subgraph}`,
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

/**
 * Get the proof of the message at a given count
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the message
 * @param count The current veaOutbox count
 * @returns The proof of the message
 */
const getProofAtCount = async (
  chainId: number,
  nonce: number,
  count: number,
  requestGraph: typeof request = request,
  calculateProofIndices: typeof getProofIndices = getProofIndices,
  fetchInboxSubgraph: typeof getInboxSubgraph = getInboxSubgraph
): Promise<string[]> => {
  const proofIndices = calculateProofIndices(nonce, count);
  if (proofIndices.length == 0) return [];

  let query = "{";
  for (let i = 0; i < proofIndices.length; i++) {
    query += `layer${i}: nodes(first: 1, where: {id: "${proofIndices[i]}"}) {
              hash
            }`;
  }
  query += "}";

  try {
    const subgraph = fetchInboxSubgraph(chainId);

    const result = await requestGraph(`https://api.studio.thegraph.com/query/${subgraph}`, query);

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

/**
 * Get the proof indices of the message
 * @param nonce The nonce of the message
 * @param count The current veaOutbox count
 * @returns The proof indices of the message
 */
const getProofIndices = (nonce: number, count: number) => {
  let proof = [];
  if (nonce >= count) return proof;

  const treeDepth = Math.ceil(Math.log2(count));

  let i = 0;
  do {
    if (i == 0 && (nonce ^ 1) < count) proof.push((nonce ^ 1).toString()); // sibling
    else {
      const low = ((nonce >> i) ^ 1) << i;
      const high = Math.min(low + Math.pow(2, i) - 1, count - 1);
      if (low < count - 1) proof.push(low.toString() + "," + high.toString());
      else if (low == count - 1) proof.push(low.toString());
    }
    i++;
  } while (i < treeDepth);

  return proof;
};

export { getProofAtCount, getMessageDataToRelay, getProofIndices };
