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
    event L2toL1Transaction(address caller, address destination);
    constructor(BridgeMock _bridge) {
        bridge = _bridge;
    }

    // Mock function to test L2 to L1 transaction
    function sendTxToL1(address destination, bytes calldata calldataForL1) external payable returns (uint256) {
        emit L2toL1Transaction(msg.sender, destination);
        return 1;
    }
}
