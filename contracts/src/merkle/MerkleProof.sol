// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

/// @title MerkleProof
/// @author Shotaro N. - <shawtarohgn@gmail.com>
/// @dev A set of funcitons to verify merkle proofs.
contract MerkleProof {
    /// @dev Validates membership of leaf in merkle tree with merkle proof.
    /// @param proof The merkle proof.
    /// @param leaf The leaf to validate membership in merkle tree.
    /// @param merkleRoot The root of the merkle tree.
    function _validateProof(bytes32[] memory proof, bytes32 leaf, bytes32 merkleRoot) internal pure returns (bool) {
        unchecked {
            for (uint256 i = 0; i < proof.length; i++) {
                bytes32 proofElement = proof[i];
                // sort sibling hashes as a convention for efficient proof validation
                if (proofElement > leaf)
                    assembly {
                        mstore(0x00, leaf)
                        mstore(0x20, proofElement)
                        leaf := keccak256(0x00, 0x40)
                    }
                else
                    assembly {
                        mstore(0x00, proofElement)
                        mstore(0x20, leaf)
                        leaf := keccak256(0x00, 0x40)
                    }
            }
        }
        return merkleRoot == leaf;
    }
}
