// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

/// @dev Interface of a contract which is updatable, receiving parameter updates from the Arbitrum Bridge through a cross-chain call.
/// @dev eg. Arbitrum (L2) -> Ethereum (L1) -> Gnosis (L1), the veaOutbox on Gnosis will be an IArbitrumUpdateable contract which receives updates from the router on Ethereum.
interface IArbitrumUpdatable {
    /// @dev Updates the sequencer limit.
    /// Note: Access restricted to ensure the argument is passed from the Arbitrum Sequencer contract.
    /// @param _newSequencerLimit The delaySeconds from the MaxTimeVariation struct in the Arbitrum Sequencer contract.
    function updateSequencerLimit(uint256 _newSequencerLimit) external;
}
