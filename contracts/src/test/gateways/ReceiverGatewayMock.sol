// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere, @adi274]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity ^0.8.24;

import "./IReceiverGatewayMock.sol";
import "../../interfaces/outboxes/IVeaOutboxOnL1.sol";

/// Receiver Gateway Mock
/// Counterpart of `SenderGatewayMock`
contract ReceiverGatewayMock is IReceiverGatewayMock {
    address public immutable veaOutbox;
    address public immutable override senderGateway;

    uint256 public messageCount;
    uint256 public data;
    uint256[] public dataArray;

    constructor(address _veaOutbox, address _senderGateway) {
        veaOutbox = _veaOutbox;
        senderGateway = _senderGateway;
    }

    modifier onlyFromVeaBridge(address msgSender) {
        require(veaOutbox == msg.sender, "Vea Bridge only.");
        require(senderGateway == msgSender, "Sender gateway mismatch.");
        _;
    }

    modifier internalCall() {
        require(msg.sender == address(this), "Internal call only.");
        _;
    }

    /// Receive the message from the sender gateway.
    function receiveMessage(address msgSender, bytes calldata data) external override onlyFromVeaBridge(msgSender) {
        // Internal call to this contract with the provided data
        (bool success, ) = address(this).call(data);
        require(success, "Internal call failed");
    }

    /// @dev Only callable via internal call from receiveMessage
    function digestMessage(uint256 _data) external override internalCall {
        messageCount++;
        data = _data;
    }

    /// @dev Only callable via internal call from receiveMessage
    function digestMessageArray(uint256[] calldata _data) external override internalCall {
        messageCount++;
        dataArray = _data;
    }
}
