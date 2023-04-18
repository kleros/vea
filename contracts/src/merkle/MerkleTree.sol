// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

/**
 *  @title MerkleTree
 *  @author Shotaro N. - <shawtarohgn@gmail.com>
 *  @dev An efficient append only merkle tree.
 */
contract MerkleTree {
    // ***************************** //
    // *         Storage           * //
    // ***************************** //

    // merkle tree representation of a batch of messages
    // supports 2^64 messages.
    bytes32[64] private tree;
    uint256 internal count;

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /** @dev Append data into merkle tree.
     *  `O(log(n))` where `n` is the number of leaves.
     *  Note: Although each insertion is O(log(n)), complexity of n total insertions is O(n).
     *  @param leaf The leaf (already hashed) to insert in the merkle tree.
     */
    function _appendMessage(bytes32 leaf) internal {
        // double hashed leaf
        // avoids second order preimage attacks
        // https://flawed.net.nz/2018/02/21/attacking-merkle-trees-with-a-second-preimage-attack/
        assembly {
            // efficient hash using EVM scratch space
            mstore(0x00, leaf)
            leaf := keccak256(0x00, 0x20)
        }

        // increment merkle tree calculating minimal number of hashes
        unchecked {
            uint256 height;

            // x = oldCount + 1; acts as a bit mask to determine if a hash is needed
            // note: x is always non-zero, and x is bit shifted to the right each loop
            // hence this loop will always terminate in a maximum of log_2(oldCount + 1) iterations
            for (uint256 x = count + 1; x & 1 == 0; x = x >> 1) {
                bytes32 oldNode = tree[height];
                // sort sibling hashes as a convention for efficient proof validation
                leaf = sortConcatAndHash(oldNode, leaf);
                height++;
            }

            tree[height] = leaf;

            // finally increment count
            count++;
        }
    }

    /** @dev Gets the current merkle root.
     *  `O(log(n))` where
     *  `n` is the number of leaves.
     */
    function _getMerkleRoot() internal view returns (bytes32 merkleRoot) {
        unchecked {
            // first hash is special case
            // tree already stores the root of complete subtrees
            // so we can skip calculating the root of the first complete subtree
            // eg tree = [H(m_1), H(H(m_1),H(m_2))], we can skip tree[0] and read tree[1] directly

            uint256 height;
            uint256 x;

            // x acts as a bit mask to determine if the hash stored in the tree contributes to the root
            // note: x is bit shifted to the right each loop, hence this loop will always terminate in a maximum of log_2(count) iterations
            for (x = count; x > 0; x = x >> 1) {
                if ((x & 1) == 1) {
                    merkleRoot = tree[height];
                    break;
                }
                height++;
            }

            for (x = x >> 1; x > 0; x = x >> 1) {
                height++;
                if ((x & 1) == 1) {
                    bytes32 treeHash = tree[height];
                    // sort sibling hashes as a convention for efficient proof validation
                    merkleRoot = sortConcatAndHash(treeHash, merkleRoot);
                }
            }
        }
    }

    /**
     * @dev Helper function to calculate merkle tree interior nodes by sorting and concatenating and hashing sibling hashes.
     * note: EVM scratch space is used to efficiently calculate hashes.
     * @param child_1 The first child hash.
     * @param child_2 The second child hash.
     * @return parent The parent hash.
     */
    function sortConcatAndHash(bytes32 child_1, bytes32 child_2) internal pure returns (bytes32 parent) {
        if (child_1 > child_2) {
            assembly {
                mstore(0x00, child_2)
                mstore(0x20, child_1)
                parent := keccak256(0x00, 0x40)
            }
        } else {
            assembly {
                mstore(0x00, child_1)
                mstore(0x20, child_2)
                parent := keccak256(0x00, 0x40)
            }
        }
    }
}
