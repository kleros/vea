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

      expect(rootOffChain).to.equal(rootOnChain);
    });

    it("Should correctly verify all nodes in the tree", async () => {
      for (const message of data) {
        const leaf = MerkleTree.makeLeafNode(message);
        proof = mt.getHexProof(leaf);
        const validation = await merkleProofExposed.validateProof(proof, leaf, rootOnChain);
        expect(validation).to.equal(true);
        expect(verify(proof, rootOffChain, leaf)).to.equal(true);
      }
    });

    it("Proof verification", async () => {
      const nodes = [
        "0x7d81ab21000c47b9bddd5ae852929a52c0354fb966724d8d1d229f4499e20859",
        "0xf7b1f7c4683b30f63811059fdd7d55a467c6ff57f36db55da0047a9bf6a6cda7",
        "0x844bc98477a034360edc8d3bb3ee070ffab314fa2c4c6341581744587ad001b0",
        "0xe57d370187ca39b44e0a194e2d5846a77c4b1703c63b9803e258d74b42c83c3c",
        "0x32935202bc4d72248339b3ad9b3c91e7d16e69b89950fa7dc2497a2ed98b1f42",
        "0x9b2db0ea497705fc42c5cfc1cf648c49daa1e7fcaa286c6fa191c5cfef39619c",
        "0x89b21fb4614a02475146160be6fb83cadd1ea38dd00f1a8ed1c880c902807ff4",
      ];
      const mt = new MerkleTree(nodes);
      const rootOffChain = mt.getHexRoot();
      const proof = mt.getHexProof("0x89b21fb4614a02475146160be6fb83cadd1ea38dd00f1a8ed1c880c902807ff4");
    });
  });
});
