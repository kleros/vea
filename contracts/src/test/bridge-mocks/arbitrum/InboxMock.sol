// SPDX-License-Identifier: MIT

/// @custom:authors: [@hrishibhat]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../../../canonical/arbitrum/IInbox.sol";

contract InboxMock is IInbox {
    IBridge public arbBridge;

    constructor(address _bridge) {
        arbBridge = IBridge(_bridge);
    }

    function bridge() external view returns (IBridge) {
        return arbBridge;
    }

    function createRetryableTicket(
        address to,
        uint256 l2CallValue,
        uint256 maxSubmissionCost,
        address excessFeeRefundAddress,
        address callValueRefundAddress,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        bytes calldata data
    ) external payable returns (uint256) {
        return 0;
    }
}
