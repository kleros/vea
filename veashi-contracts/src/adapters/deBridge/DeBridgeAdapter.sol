// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {Adapter} from "../Adapter.sol";
import {Governed} from "../../governance/Governed.sol";
import {IDeBridgeGate} from "./interfaces/IDeBridgeGate.sol";
import {ICallProxy} from "./interfaces/ICallProxy.sol";

contract DeBridgeAdapter is Adapter, Governed {
    string public constant PROVIDER = "debridge";

    IDeBridgeGate public immutable deBridgeGate;

    /// @dev EVM chain id => reporter.
    mapping(uint256 => address) public enabledReporters;
    /// @dev deBridge chain id => EVM chain id (deBridge addresses some chains by its own ids, e.g. Story 100000013 => 1514).
    mapping(uint256 => uint256) public chainIds;

    error NotProxy();
    error UnauthorizedSender(address sender, uint256 chainId);
    error ChainIdNotSet(uint256 deBridgeChainId);

    event ReporterSet(uint256 indexed chainId, address indexed reporter);
    event ChainIdSet(uint256 indexed deBridgeChainId, uint256 indexed chainId);

    constructor(address _deBridgeGate, address governor_) Governed(governor_) {
        deBridgeGate = IDeBridgeGate(_deBridgeGate);
    }

    function setReporterByChainId(uint256 chainId, address reporter) external onlyByGovernor {
        enabledReporters[chainId] = reporter;
        emit ReporterSet(chainId, reporter);
    }

    function setChainIdByDeBridgeChainId(uint256 deBridgeChainId, uint256 chainId) external onlyByGovernor {
        chainIds[deBridgeChainId] = chainId;
        emit ChainIdSet(deBridgeChainId, chainId);
    }

    function storeHashes(uint256[] calldata ids, bytes32[] calldata hashes) external {
        ICallProxy callProxy = ICallProxy(deBridgeGate.callProxy());
        if (address(callProxy) != msg.sender) revert NotProxy();

        address sender = address(uint160(bytes20(callProxy.submissionNativeSender())));
        uint256 deBridgeChainId = callProxy.submissionChainIdFrom();
        uint256 chainId = chainIds[deBridgeChainId];
        if (chainId == 0) revert ChainIdNotSet(deBridgeChainId);
        if (enabledReporters[chainId] != sender) revert UnauthorizedSender(sender, chainId);

        _storeHashes(chainId, ids, hashes);
    }
}
