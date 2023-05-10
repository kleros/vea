// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

interface IRouterArbToOpt {
    /// Note: Access restricted to canonical bridge.
    /// @dev Resolves any challenge of the optimistic claim for 'epoch' using the canonical bridge.
    /// @param epoch The epoch to verify.
    /// @param stateRoot The true state root for the epoch.
    function route(uint256 epoch, bytes32 stateRoot) external;
}
