// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../../interfaces/IReceiverGateway.sol";

interface IReceiverGatewayMock is IReceiverGateway {
    /**
     * Receive the message from the sender gateway.
     */
    function receiveMessage(uint256 _data) external;
}
