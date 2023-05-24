// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../types/VeaClaim.sol";

/// @dev Interface of the Vea Outbox on L1 chains like Ethereum, Gnosis, Polygon POS where storage is expensive.
interface IVeaOutboxOnL1 {
    /// @dev Verifies and relays the message.
    /// Note: Gateways expect first argument of message call to be the arbitrum message sender, used for authentication.
    /// @param _proof The merkle proof to prove the message.
    /// @param _msgId The zero based index of the message in the inbox.
    /// @param _to The address to send the message to.
    /// @param _message The message to relay.
    function sendMessage(bytes32[] calldata _proof, uint64 _msgId, address _to, bytes calldata _message) external;

    /// @dev Resolves any challenge of the optimistic claim for 'epoch' using the canonical bridge.
    /// Note: Access restricted to canonical bridge.
    /// @param _epoch The epoch to verify.
    /// @param _stateRoot The true state root for the epoch.
    /// @param _claim The claim associated with the epoch.
    function resolveDisputedClaim(uint256 _epoch, bytes32 _stateRoot, Claim memory _claim) external;
}
