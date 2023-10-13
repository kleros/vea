// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../interfaces/inboxes/IVeaInbox.sol";

/// @dev Vea Inbox Calldata Optimization.
///      No function selector required, only fallback function.
contract veaInboxTouch {
    IVeaInbox public immutable veaInbox;

    constructor(IVeaInbox _veaInbox) {
        veaInbox = _veaInbox;
    }

    function touch(uint256 random) external payable {
        veaInbox.sendMessage(0x0000000000000000000000000000000000000000, 0x00000000, abi.encode(random));
        veaInbox.saveSnapshot();
    }
}
