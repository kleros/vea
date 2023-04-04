// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "./IChallengeResolver.sol";

interface IVeaOutbox is IChallengeResolver {
    /**
     * @dev Verifies and relays the message.
     * @param proof The merkle proof to prove the message.
     * @param index The index of the message in the merkle tree.
     * @param msgSender The address of the message sender.
     * @param to The address of the message receiver.
     * @param data The data of the message.
     */
    function verifyAndRelayMessage(
        bytes32[] calldata proof,
        uint64 index,
        address msgSender,
        address to,
        bytes calldata data
    ) external;

    /**
     * @dev The message sender of a relayed message.
     * @return messageSender The address of the message sender.
     */
    function messageSender() external returns (address messageSender);
}
