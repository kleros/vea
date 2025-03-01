// SPDX-License-Identifier: MIT
// https://github.com/poanetwork/tokenbridge-contracts/blob/master/contracts/mocks/AMBMock.sol
pragma solidity 0.8.24;

import "../../../canonical/gnosis-chain/IAMB.sol";

contract MockAMB is IAMB {
    event MockedEvent(bytes32 indexed messageId, bytes encodedData, bytes _data);

    address public messageSender;
    uint256 public maxGasPerTx;
    bytes32 public transactionHash;
    bytes32 public messageId;
    uint64 public nonce;
    bytes32 public messageSourceChainId;
    mapping(bytes32 => bool) public messageCallStatus;
    mapping(bytes32 => address) public failedMessageSender;
    mapping(bytes32 => address) public failedMessageReceiver;
    mapping(bytes32 => bytes32) public failedMessageDataHash;

    event MessagePassed(address _contract, bytes _data, uint256 _gas);

    function setMaxGasPerTx(uint256 _value) public {
        maxGasPerTx = _value;
    }

    function executeMessageCall(
        address _contract,
        address _sender,
        bytes memory _data,
        bytes32 _messageId,
        uint256 _gas
    ) public {
        messageSender = _sender;
        messageId = _messageId;
        transactionHash = _messageId;
        messageSourceChainId = bytes32(uint256(31337));
        (bool status, bytes memory returnData) = _contract.call{gas: _gas}(_data);

        if (!status) {
            assembly {
                revert(add(returnData, 32), mload(returnData))
            }
        }
        messageSender = address(0);
        messageId = bytes32(0);
        transactionHash = bytes32(0);
        messageSourceChainId = bytes32(uint256(0));

        messageCallStatus[_messageId] = status;
        if (!status) {
            failedMessageDataHash[_messageId] = keccak256(_data);
            failedMessageReceiver[_messageId] = _contract;
            failedMessageSender[_messageId] = _sender;
        }
    }

    function requireToPassMessage(address _contract, bytes memory _data, uint256 _gas) external returns (bytes32) {
        return _sendMessage(_contract, _data, _gas, 0x00);
    }

    function requireToConfirmMessage(address _contract, bytes memory _data, uint256 _gas) external returns (bytes32) {
        return _sendMessage(_contract, _data, _gas, 0x80);
    }

    function _sendMessage(
        address _contract,
        bytes memory _data,
        uint256 _gas,
        uint256 _dataType
    ) internal returns (bytes32) {
        require(messageId == bytes32(0));
        bytes32 bridgeId = keccak256(abi.encodePacked(uint16(31337), address(this))) &
            0x00000000ffffffffffffffffffffffffffffffffffffffff0000000000000000;

        bytes32 _messageId = bytes32(uint256(0x11223344 << 224)) | bridgeId | bytes32(uint256(nonce));
        nonce += 1;
        bytes memory eventData = abi.encodePacked(
            _messageId,
            msg.sender,
            _contract,
            uint32(_gas),
            uint8(2),
            uint8(2),
            uint8(_dataType),
            uint16(31337),
            uint16(31337),
            _data
        );

        emit MockedEvent(_messageId, eventData, _data);
        return _messageId;
    }

    function requireToGetInformation(bytes32 _requestSelector, bytes memory _data) external returns (bytes32) {}

    function sourceChainId() external view returns (uint256) {}

    function destinationChainId() external view returns (uint256) {}
}
