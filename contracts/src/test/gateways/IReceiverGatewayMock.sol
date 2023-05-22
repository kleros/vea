// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere, @adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../../interfaces/gateways/IReceiverGateway.sol";

interface IReceiverGatewayMock is IReceiverGateway {
    /**
     * Receive the message from the sender gateway.
     */
    function receiveMessage(address msgSender, uint256 _data) external;
}
