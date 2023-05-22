// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../../interfaces/inboxes/IVeaInbox.sol";

/**
 * Vea Inbox veaInboxSaveSnapshot Calldata Optimization.
 * No function selector required, only fallback function.
 */
contract veaInboxSaveSnapshot {
    IVeaInbox public immutable veaInbox;

    constructor(IVeaInbox _veaInbox) {
        veaInbox = _veaInbox;
    }

    fallback() external {
        veaInbox.saveSnapshot();
    }
}
