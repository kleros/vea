// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere, @adi274]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../../interfaces/gateways/IReceiverGateway.sol";

interface IReceiverGatewayMock is IReceiverGateway {
    /// Receive the message from the sender gateway.
    function receiveMessage(address msgSender, uint256 _data) external;
}
