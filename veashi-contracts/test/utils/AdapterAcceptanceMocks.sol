// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev An Axelar gateway that validates only the calls the test approved, once each, for the calling contract.
contract VAAxelarGatewayMock {
    mapping(bytes32 => bool) public approved;

    function approveContractCall(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash
    ) external {
        approved[_key(commandId, sourceChain, sourceAddress, contractAddress, payloadHash)] = true;
    }

    function validateContractCall(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes32 payloadHash
    ) external returns (bool valid) {
        bytes32 key = _key(commandId, sourceChain, sourceAddress, msg.sender, payloadHash);
        valid = approved[key];
        if (valid) delete approved[key];
    }

    function _key(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(commandId, sourceChain, sourceAddress, contractAddress, payloadHash));
    }
}
