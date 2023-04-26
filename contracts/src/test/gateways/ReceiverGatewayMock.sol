// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere, @adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "./IReceiverGatewayMock.sol";

/**
 * Receiver Gateway Mock
 * Counterpart of `SenderGatewayMock`
 */
contract ReceiverGatewayMock is IReceiverGatewayMock {
    IVeaOutbox public immutable veaOutbox;
    address public immutable override senderGateway;

    uint256 public messageCount;
    uint256 public data;

    constructor(IVeaOutbox _veaOutbox, address _senderGateway) {
        veaOutbox = _veaOutbox;
        senderGateway = _senderGateway;
    }

    modifier onlyFromBridge() {
        require(address(veaOutbox) == msg.sender, "Vea Bridge only.");
        _;
    }

    /**
     * Receive the message from the sender gateway.
     */
    function receiveMessage(address messageSender) external onlyFromBridge {
        require(messageSender == senderGateway, "Only the sender gateway is allowed.");
        _receiveMessage();
    }

    /**
     * Receive the message from the sender gateway.
     */
    function receiveMessage(address messageSender, uint256 _data) external onlyFromBridge {
        require(messageSender == senderGateway, "Only the sender gateway is allowed.");
        _receiveMessage(_data);
    }

    function _receiveMessage() internal {
        messageCount++;
    }

    function _receiveMessage(uint256 _data) internal {
        messageCount++;
        data = _data;
    }
}
