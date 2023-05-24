// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere, @adi274]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "./IReceiverGatewayMock.sol";
import "../../interfaces/gateways/ISenderGateway.sol";

/// Sender Gateway
/// Counterpart of `ReceiverGatewayMock`
contract SenderGatewayMock is ISenderGateway {
    IVeaInbox public immutable veaInbox;
    address public override receiverGateway;

    constructor(IVeaInbox _veaInbox, address _receiverGateway) {
        veaInbox = _veaInbox;
        receiverGateway = _receiverGateway;
    }

    function sendMessage(uint256 _data) external {
        bytes4 methodSelector = IReceiverGatewayMock.receiveMessage.selector;
        bytes memory data = abi.encode(_data);
        veaInbox.sendMessage(receiverGateway, methodSelector, data);
    }
}
