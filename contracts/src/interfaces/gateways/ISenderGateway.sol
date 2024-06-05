// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "../inboxes/IVeaInbox.sol";

interface ISenderGateway {
    function veaInbox() external view returns (IVeaInbox);

    function receiverGateway() external view returns (address);
}
