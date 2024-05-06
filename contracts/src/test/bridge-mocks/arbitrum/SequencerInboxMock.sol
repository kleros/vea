// SPDX-License-Identifier: MIT

/// @custom:authors: [@hrishibhat, @adi274]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "../../../canonical/arbitrum/ISequencerInbox.sol";

contract SequencerInboxMock is ISequencerInbox {
    uint256 public delaySeconds;

    constructor(uint256 _delaySeconds) {
        delaySeconds = _delaySeconds;
    }

    function maxTimeVariation() external view returns (uint256, uint256, uint256, uint256) {
        return (0, 0, delaySeconds, 0);
    }
}
