// SPDX-License-Identifier: MIT

/// @custom:authors: [@hrishibhat]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "../../../canonical/arbitrum/IArbSys.sol";

contract ArbSysMock is IArbSys {
    function sendTxToL1(
        address destination,
        bytes calldata calldataForL1
    ) external payable returns (uint256 _withdrawal_ID) {
        (bool success, ) = address(destination).call(calldataForL1);
        require(success, "Failed TxToL1");
        return _withdrawal_ID;
    }
}
