// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

/**
 * @dev Interface of the Vea Outbox on L2s like Arbitrum, Optimism, Base, Specular where storage is inexpensive.
 */
interface IVeaOutboxOnL2 {
    /**
     * Note: Gateways expect first argument of message call to be the inbox sender, used for authentication.
     * @dev Verifies and relays the message.
     * @param _proof The merkle proof to prove the message.
     * @param _msgId The zero based index of the message in the inbox.
     * @param _to The address to send the message to.
     * @param _message The message to relay.
     */
    function sendMessage(bytes32[] calldata _proof, uint64 _msgId, address _to, bytes calldata _message) external;

    /**
     * Note: Access restricted to canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for 'epoch' using the canonical bridge.
     * @param _epoch The epoch to verify.
     * @param _stateRoot The true state root for the epoch.
     */
    function resolveDisputedClaim(uint256 _epoch, bytes32 _stateRoot) external;
}
