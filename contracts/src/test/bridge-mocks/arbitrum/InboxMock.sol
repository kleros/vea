// SPDX-License-Identifier: MIT

/**
 *  @authors: [@hrishibhat]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

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
}
