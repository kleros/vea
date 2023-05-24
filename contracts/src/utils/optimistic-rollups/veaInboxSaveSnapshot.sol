// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../../interfaces/inboxes/IVeaInbox.sol";

/// @dev Vea Inbox Calldata Optimization.
///      No function selector required, only fallback function.
contract VeaInboxSaveSnapshot {
    IVeaInbox public immutable veaInbox;

    constructor(IVeaInbox _veaInbox) {
        veaInbox = _veaInbox;
    }

    fallback() external {
        veaInbox.saveSnapshot();
    }
}
