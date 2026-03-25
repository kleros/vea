// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {Adapter} from "@hashi/adapters/Adapter.sol";
import {IReceiverGateway} from "./interfaces/IReceiverGateway.sol";
import {Ownable} from "@openzeppelin/contracts@5.0.2/access/Ownable.sol";

contract VeaAdapter is IReceiverGateway, Adapter, Ownable {
    string public constant PROVIDER = "vea";
    address public immutable VEA_OUTBOX;
    address public REPORTER;
    uint256 public immutable SOURCE_CHAIN_ID;

    error ArrayLengthMissmatch();
    error InvalidVeaOutbox(address veaOutbox, address expectedVeaOutboux);
    error InvalidReporter(address reporter, address expectedReporter);

    constructor(address veaOutbox_, uint256 sourceChainId) Ownable(msg.sender) {
        VEA_OUTBOX = veaOutbox_;
        SOURCE_CHAIN_ID = sourceChainId;
    }

    modifier onlyFromAuthenticatedVeaSender(address sourceMsgSender) {
        if (msg.sender != VEA_OUTBOX) revert InvalidVeaOutbox(msg.sender, VEA_OUTBOX);
        if (sourceMsgSender != REPORTER) revert InvalidReporter(REPORTER, sourceMsgSender);
        _;
    }

    function setReporter(address reporter) external onlyOwner {
        REPORTER = reporter;
    }

    function senderGateway() external view override returns (address) {
        return REPORTER;
    }

    function veaOutbox() external view override returns (address) {
        return VEA_OUTBOX;
    }

    function receiveMessage(
        address sourceMsgSender,
        bytes calldata data
    ) external override onlyFromAuthenticatedVeaSender(sourceMsgSender) {
        (uint256[] memory ids, bytes32[] memory hashes) = abi.decode(data, (uint256[], bytes32[]));
        _storeHashes(SOURCE_CHAIN_ID, ids, hashes);
    }
}
