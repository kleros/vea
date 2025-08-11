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

    modifier onlyFromVeaBridge() {
        require(veaOutbox == msg.sender, "Vea Bridge only.");
        _;
    }

    function allowlistSender(bool _allowed) external {
        IVeaOutboxOnL1(veaOutbox).setAllowlist(senderGateway, _allowed);
    }

    /// Receive the message from the sender gateway.
    function receiveMessage(uint256 _data) external onlyFromVeaBridge {
        _receiveMessage(_data);
    }

    function receiveMessageArray(uint256[] calldata _data) external onlyFromVeaBridge {
        _receiveMessage();
        dataArray = _data;
    }

    function _receiveMessage() internal {
        messageCount++;
    }

    function _receiveMessage(uint256 _data) internal {
        messageCount++;
        data = _data;
    }
}
