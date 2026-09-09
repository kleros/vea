import request from "graphql-request";
import { DataError } from "./errors";

interface MessageSentData {
  nonce: number;
  to: {
    id: string;
  };
  msgSender: {
    id: string;
  };
  data: string;
}

interface MessageSentsDataResponse {
  MessageSent: MessageSentData[];
}
/**
 * Get the message data to relay from the subgraph
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the message
 * @returns The message id and data to relay
 */
const getMessageDataToRelay = async (
  chainId: number,
  inbox: string,
  nonce: number,
  network: string,
  requestGraph: typeof request = request
) => {
  try {
    const subgraph = process.env.ENVIO_URL!;

    const result = (await requestGraph(
      subgraph,
      `{
                MessageSent(limit: 5, where: {nonce: {_eq: ${nonce}}, inbox: {id: {_eq: "${inbox}"}}}) {
                nonce
                to {
                    id
                }
                msgSender {
                    id
                }
                data
                }
            }`
    )) as MessageSentsDataResponse;

    return [result[`MessageSent`][0].to.id, result[`MessageSent`][0].msgSender.id, result[`MessageSent`][0].data];
  } catch (e) {
    throw new DataError("Failed to fetch message data (subgraph)", chainId, network, { cause: e });
  }
};

interface LayerResponse {
  hash: string;
}

interface ProofAtCountResponse {
  [key: string]: LayerResponse[];
}
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
  inboxAddress: string, // New parameter for inbox filtering
  network: string,
  requestGraph: typeof request = request,
  calculateProofIndices: typeof getProofIndices = getProofIndices
): Promise<string[]> => {
  const proofIndices = calculateProofIndices(nonce, count);
  if (proofIndices.length === 0) return [];
  // Build a query that filters each node by both its id and the inbox address.
  let query = "{";
  for (let i = 0; i < proofIndices.length; i++) {
    const layerId = inboxAddress + "-" + proofIndices[i];
    query += `
      layer${i}: MerkleNode(limit: 1, where: {
        id: { _eq: "${layerId}" }
      }) {
        hash
      }
    `;
  }
  query += "}";

  try {
    const subgraph = process.env.ENVIO_URL!;
    const result = (await requestGraph(subgraph, query)) as ProofAtCountResponse;
    const proof: string[] = [];
    for (let i = 0; i < proofIndices.length; i++) {
      proof.push(result[`layer${i}`][0].hash);
    }
    return proof;
  } catch (e) {
    throw new DataError("Failed to fetch proof (subgraph)", chainId, network, { cause: e });
  }
};

/**
 * Get the proof indices of the message
 * @param nonce The nonce of the message
 * @param count The current veaOutbox count
 * @returns The proof indices of the message
 */
const getProofIndices = (nonce: number, count: number) => {
  let proof: string[] = [];
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
