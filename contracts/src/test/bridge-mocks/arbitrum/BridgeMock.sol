// SPDX-License-Identifier: MIT

/// @custom:authors: [@hrishibhat,@madhurMongia]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "../../../canonical/arbitrum/IBridge.sol";

contract BridgeMock is IBridge {
    address public outbox;
    address public sequencerInbox;

    constructor(address _outbox, address _sequencerInbox) {
        sequencerInbox = _sequencerInbox;
        outbox = _outbox;
    }

    function activeOutbox() external view returns (address _outbox) {
        return address(outbox);
    }

    function allowedDelayedInboxList(uint256 index) external returns (address) {
        if (index == 0) return sequencerInbox;
        return address(0);
    }

    function executeL1Message(address destination, bytes calldata data) external returns (uint256) {
        // Simulate the bridge calling the destination contract
        (bool success, bytes memory returnData) = destination.call(data);

        if (!success) {
            assembly {
                revert(add(returnData, 32), mload(returnData))
            }
        }

        return 0;
    }
}
