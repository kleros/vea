// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Reporter} from "../Reporter.sol";
import {IDeBridgeGate} from "./interfaces/IDeBridgeGate.sol";
import {Flags} from "./utils/Flags.sol";

contract DeBridgeReporter is Reporter, Ownable {
    string public constant PROVIDER = "debridge";

    IDeBridgeGate public immutable deBridgeGate;
    uint256 fee;

    event FeeSet(uint256 fee);

    constructor(address headerStorage, address yaho, address deBridgeGate_) Reporter(headerStorage, yaho) {
        deBridgeGate = IDeBridgeGate(deBridgeGate_);
    }

    function setFee(uint256 fee_) external onlyOwner {
        fee = fee_;
        emit FeeSet(fee);
    }

    function _dispatch(
        uint256 targetChainId,
        address adapter,
        uint256[] memory ids,
        bytes32[] memory hashes
    ) internal override returns (bytes32) {
        uint256 protocolFee = deBridgeGate.globalFixedNativeFee();
        IDeBridgeGate.SubmissionAutoParamsTo memory autoParams;
        autoParams.executionFee = fee;

        // Exposing nativeSender must be requested explicitly by setting the PROXY_WITH_SENDER flag
        autoParams.flags = Flags.setFlag(autoParams.flags, Flags.PROXY_WITH_SENDER, true);
        // if something happens, we revert the transaction
        autoParams.flags = Flags.setFlag(autoParams.flags, Flags.REVERT_IF_EXTERNAL_FAIL, true);
        autoParams.data = abi.encodeWithSignature("storeHashes(uint256[],bytes32[])", ids, hashes);
        autoParams.fallbackAddress = abi.encodePacked(msg.sender);
        bytes32 submissionId = deBridgeGate.sendMessage{value: fee + protocolFee}(
            targetChainId,
            abi.encodePacked(adapter),
            abi.encodeWithSignature("storeHashes(uint256[],bytes32[])", ids, hashes),
            autoParams.flags,
            0
        );
        return submissionId;
    }

    receive() external payable {}
}
