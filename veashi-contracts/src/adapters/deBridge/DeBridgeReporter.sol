// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {Reporter} from "../Reporter.sol";
import {PaidReporter} from "../PaidReporter.sol";
import {IAdapter} from "../../interfaces/IAdapter.sol";
import {IDeBridgeGate} from "./interfaces/IDeBridgeGate.sol";
import {Flags} from "./utils/Flags.sol";

contract DeBridgeReporter is PaidReporter {
    string public constant PROVIDER = "debridge";

    IDeBridgeGate public immutable deBridgeGate;
    uint256 public fee;
    /// @dev EVM chain id => deBridge chain id (deBridge addresses some chains by its own ids, e.g. Story 1514 => 100000013).
    mapping(uint256 => uint256) public deBridgeChainIds;

    error DeBridgeChainIdNotSet(uint256 chainId);

    event FeeSet(uint256 fee);
    event DeBridgeChainIdSet(uint256 indexed chainId, uint256 indexed deBridgeChainId);

    constructor(
        address yaho,
        address deBridgeGate_,
        address governor_,
        address keeper_
    ) Reporter(yaho, governor_, keeper_) {
        deBridgeGate = IDeBridgeGate(deBridgeGate_);
    }

    function setDeBridgeChainIdByChainId(uint256 chainId, uint256 deBridgeChainId) external onlyByGovernor {
        deBridgeChainIds[chainId] = deBridgeChainId;
        emit DeBridgeChainIdSet(chainId, deBridgeChainId);
    }

    function setFee(uint256 fee_) external onlyByGovernorOrKeeper {
        _checkKeeperUpdate(keccak256("fee"), fee, fee_);
        fee = fee_;
        emit FeeSet(fee_);
    }

    /// @inheritdoc PaidReporter
    function quoteDispatch(
        uint256 targetChainId,
        IAdapter,
        uint256[] memory,
        bytes32[] memory
    ) public view override returns (address token, uint256 amount) {
        _deBridgeChainId(targetChainId);
        return (address(0), fee + deBridgeGate.globalFixedNativeFee());
    }

    function _dispatch(
        uint256 targetChainId,
        address adapter,
        uint256[] memory ids,
        bytes32[] memory hashes
    ) internal override returns (bytes32) {
        uint256 targetDeBridgeChainId = _deBridgeChainId(targetChainId);
        uint256 protocolFee = deBridgeGate.globalFixedNativeFee();

        // Exposing nativeSender must be requested explicitly by setting the PROXY_WITH_SENDER flag
        uint256 flags = Flags.setFlag(0, Flags.PROXY_WITH_SENDER, true);
        // if something happens, we revert the transaction
        flags = Flags.setFlag(flags, Flags.REVERT_IF_EXTERNAL_FAIL, true);
        bytes32 submissionId = deBridgeGate.sendMessage{value: fee + protocolFee}(
            targetDeBridgeChainId,
            abi.encodePacked(adapter),
            abi.encodeWithSignature("storeHashes(uint256[],bytes32[])", ids, hashes),
            flags,
            0
        );
        return submissionId;
    }

    function _deBridgeChainId(uint256 targetChainId) internal view returns (uint256 targetDeBridgeChainId) {
        targetDeBridgeChainId = deBridgeChainIds[targetChainId];
        if (targetDeBridgeChainId == 0) revert DeBridgeChainIdNotSet(targetChainId);
    }
}
