// SPDX-License-Identifier: MIT

/// @custom:authors: [@hrishibhat, @adi274]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../../../canonical/arbitrum/IOutbox.sol";

contract OutboxMock is IOutbox {
    address public veaInbox;

    constructor(address _veaInbox) {
        veaInbox = _veaInbox;
    }

    function l2ToL1Sender() external view returns (address) {
        return address(veaInbox);
    }

    function l2ToL1Block() external view returns (uint256) {}

    function l2ToL1EthBlock() external view returns (uint256) {}

    function l2ToL1Timestamp() external view returns (uint256) {}

    function processOutgoingMessages(bytes calldata sendsData, uint256[] calldata sendLengths) external {}
}
