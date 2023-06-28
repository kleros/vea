// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

/// @dev Interface of a contract which is updatable, receiving parameter updates from an L1 contract through a cross-chain call.
/// @dev eg. Arbitrum (L2) -> Ethereum (L1) -> Gnosis (L1), the veaOutbox on Gnosis will be an ISequencerFutureUpdatable contract which receives updates from the router on Ethereum.
interface ISequencerFutureUpdatable {
    /// @dev Updates the sequencer limit.
    /// Note: Access restricted to ensure the argument is passed from the Sequencer contract.
    /// @param _newSequencerFutureLimit The futureSeconds from the MaxTimeVariation struct in the Arbitrum Sequencer contract.
    /// @param _timestamp The timestamp of the message.
    function updateSequencerFutureLimit(uint256 _newSequencerFutureLimit, uint256 _timestamp) external;
}
