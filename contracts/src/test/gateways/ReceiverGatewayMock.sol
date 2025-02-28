// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere, @adi274]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "./IReceiverGatewayMock.sol";

/// Receiver Gateway Mock
/// Counterpart of `SenderGatewayMock`
contract ReceiverGatewayMock is IReceiverGatewayMock {
    address public immutable veaOutbox;
    address public immutable override senderGateway;

    uint256 public messageCount;
    uint256 public data;

    constructor(address _veaOutbox, address _senderGateway) {
        veaOutbox = _veaOutbox;
        senderGateway = _senderGateway;
    }

    modifier onlyFromAuthenticatedVeaSender(address messageSender) {
        require(veaOutbox == msg.sender, "Vea Bridge only.");
        require(messageSender == senderGateway, "Only the sender gateway is allowed.");
        _;
    }

    /// Receive the message from the sender gateway.
    function receiveMessage(address messageSender) external onlyFromAuthenticatedVeaSender(messageSender) {
        _receiveMessage();
    }

    /// Receive the message from the sender gateway.
    function receiveMessage(
        address messageSender,
        uint256 _data
    ) external onlyFromAuthenticatedVeaSender(messageSender) {
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
