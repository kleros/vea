// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

interface IVeaOutbox {
    /**
     * Note: Gateways expect first argument of message call to be the inbox sender, used for authenitcation.
     * @dev Verifies and relays the message.
     * @param proof The merkle proof to prove the message.
     * @param msgId The zero based index of the message in the inbox.
     * @param to The address to send the message to.
     * @param message The message to relay.
     */
    function sendMessage(bytes32[] calldata proof, uint64 msgId, address to, bytes calldata message) external;

    /**
     * Note: Access restricted to canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for 'epoch' using the canonical bridge.
     * @param epoch The epoch to verify.
     * @param stateRoot The true state root for the epoch.
     */
    function resolveDisputedClaim(uint256 epoch, bytes32 stateRoot) external;

    /**
     * @dev Keeps bridge alive.
     * @param timestamp The timestamp of the heartbeat.
     */
    function heartbeat(uint256 timestamp) external;
}
