import { expect } from "chai";
import { ethers } from "hardhat";
import { toBuffer } from "ethereumjs-util";
import { soliditySha3 } from "web3-utils";
import { MerkleTree } from "./MerkleTree";

/**
 * Adapted from OpenZeppelin MerkleProof contract.
 *
 * @see {https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/cryptography/MerkleProof.sol}
 * @param proof The merkle path from `leaf` to `root`.
 * @param root The root of the merkle tree.
 * @param leaf The leaf node.
 * @return valid Whether the proof is valid or not.
 */
function verify(proof: string[], root: string, leaf: string) {
  return (
    root ===
    proof.reduce(
      (computedHash: string, proofElement: string, currentIndex: number): string =>
        Buffer.compare(toBuffer(computedHash), toBuffer(proofElement)) <= 0
          ? (soliditySha3(computedHash, proofElement) as string)
          : (soliditySha3(proofElement, computedHash) as string),
      leaf
    )
  );
}

describe("Merkle", async () => {
  describe("Sanity tests", async () => {
    let merkleTreeExposed;
    let merkleProofExposed;
    let data, nodes, mt;
    let rootOnChain, rootOffChain, proof;

    before("Deploying", async () => {
      const merkleTreeExposedFactory = await ethers.getContractFactory("MerkleTreeExposed");
      const merkleProofExposedFactory = await ethers.getContractFactory("MerkleProofExposed");
      merkleTreeExposed = await merkleTreeExposedFactory.deploy();
      merkleProofExposed = await merkleProofExposedFactory.deploy();
      await merkleTreeExposed.deployed();
      await merkleProofExposed.deployed();
    });

    it("Merkle Root verification", async () => {
      data = ["0x00", "0x01", "0x03"];
      nodes = [];
      for (const message of data) {
        await merkleTreeExposed.appendMessage(message);
        nodes.push(MerkleTree.makeLeafNode(message));
      }
      mt = new MerkleTree(nodes);
      rootOffChain = mt.getHexRoot();
      rootOnChain = await merkleTreeExposed.getMerkleRoot();
      console.log("######");
      console.log(rootOffChain);
      console.log(rootOnChain);
      console.log("########################");

      expect(rootOffChain).to.equal(rootOnChain);
    });

    it("Should correctly verify all nodes in the tree", async () => {
      for (const message of data) {
        const leaf = ethers.utils.sha256(message);
        proof = mt.getHexProof(leaf);
        const validation = await merkleProofExposed.validateProof(proof, ethers.utils.sha256(message), rootOnChain);
        expect(validation).to.equal(true);
        expect(verify(proof, rootOffChain, leaf)).to.equal(true);
      }
    });
  });
});
