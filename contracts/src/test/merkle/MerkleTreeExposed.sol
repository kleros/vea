// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../../merkle/MerkleTree.sol";

/**
 *  @title MerkleTreeExposed
 *  @author Shotaro N. - <shawtarohgn@gmail.com>
 *  @dev Exposes MerkleTree for testing
 */
contract MerkleTreeExposed is MerkleTree {
    function appendMessage(bytes memory _leaf) external {
        _appendMessage(keccak256(_leaf));
    }

    function getMerkleRoot() external view returns (bytes32) {
        return _getMerkleRoot();
    }
}
