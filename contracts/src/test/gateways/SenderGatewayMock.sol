// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere, @adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "./IReceiverGatewayMock.sol";
import "../../interfaces/ISenderGateway.sol";

/**
 * Sender Gateway
 * Counterpart of `ReceiverGatewayMock`
 */
contract SenderGatewayMock is ISenderGateway {
    IVeaInbox public immutable veaInbox;
    address public override receiverGateway;
    uint256 public immutable override receiverChainID;

    constructor(
        IVeaInbox _veaInbox,
        address _receiverGateway,
        uint256 _receiverChainID
    ) {
        veaInbox = _veaInbox;
        receiverGateway = _receiverGateway;
        receiverChainID = _receiverChainID;
    }

    function sendFastMessage(uint256 _data) external {
        bytes4 methodSelector = IReceiverGatewayMock.receiveMessage.selector;
        bytes memory data = abi.encodeWithSelector(methodSelector, _data);
        veaInbox.sendMsg(receiverGateway, data);
    }
}
