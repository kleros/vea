// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

interface IReceiverGateway {
    function veaOutbox() external view returns (address);

    function senderGateway() external view returns (address);
}
