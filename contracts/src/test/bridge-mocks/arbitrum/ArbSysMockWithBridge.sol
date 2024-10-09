// SPDX-License-Identifier: MIT

/// @custom:authors: [@madhurMongia]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "../../../canonical/arbitrum/IArbSys.sol";
import "./BridgeMock.sol";

contract ArbSysMockWithBridge is IArbSys {
    BridgeMock public immutable bridge;

    constructor(BridgeMock _bridge) {
        bridge = _bridge;
    }

    function sendTxToL1(
        address destination,
        bytes calldata calldataForL1
    ) external payable returns (uint256 _withdrawal_ID) {
        return bridge.executeL1Message(destination, calldataForL1);
    }
}
