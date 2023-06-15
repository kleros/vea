// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

/// @dev Interface of the Vea Outbox on Optimistic Rollup L2s like Arbitrum, Optimism, Base, Specular where L2 storage is inexpensive compared to L1 calldata.
interface IVeaOutboxOnL2 {
    /// @dev Verifies and relays the message.
    /// Note: Gateways expect first argument of message call to be the inbox sender, used for authentication.
    /// @param _proof The merkle proof to prove the message.
    /// @param _msgId The zero based index of the message in the inbox.
    /// @param _to The address to send the message to.
    /// @param _message The message to relay.
    function sendMessage(bytes32[] calldata _proof, uint64 _msgId, address _to, bytes calldata _message) external;

    /// @dev Resolves any challenge of the optimistic claim for 'epoch' using the canonical bridge.
    /// Note: Access restricted to canonical bridge.
    /// @param _epoch The epoch to verify.
    /// @param _stateRoot The true state root for the epoch.
    function resolveDisputedClaim(uint256 _epoch, bytes32 _stateRoot) external;
}
