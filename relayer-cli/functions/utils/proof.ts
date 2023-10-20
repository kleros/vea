import { Supported } from "../../types";
import { getProof, supportedChainIdsOutbox } from "./subgraph";

const getProofAtCount = async (
  chainid: Supported<typeof supportedChainIdsOutbox>,
  nonce: number,
  count: number
): Promise<string[]> => {
  const proofIndices = getProofIndices(nonce, count);
  const rawProof = await getProof(chainid, { proofIndices });
  //rawproof is ordered by id, we want same order as proofIndices
  rawProof.nodes.sort((a, b) => proofIndices.indexOf(a.id) - proofIndices.indexOf(b.id));
  return rawProof.nodes.reduce((acc, node) => {
    acc.push(node);
    return acc;
  }, []);
};

const getProofIndices = (nonce: number, count: number): string[] => {
  let proof: string[] = [];
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

export { getProofAtCount };
