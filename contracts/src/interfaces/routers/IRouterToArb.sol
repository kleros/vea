// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

/// @dev Interface of the Vea Router intended to be deployed on an intermediary chain which routes messages to Arbitrum where calldata is the primary cost.
///      eg. Gnosis (L1) -> Ethereum (L1) -> Arbitrum (L2), the IRouterToL2 will be deployed on Ethereum (L1) routing messages to Arbitrum (L2).
interface IRouterToArb {
    /// @dev Resolves any challenge of the optimistic claim for 'epoch' using the canonical bridge.
    /// Note: Access restricted to canonical sending-chain bridge.
    /// @param _epoch The epoch to verify.
    /// @param _stateroot The true state root for the epoch.
    /// @param _inboxIndex The index of the inbox in the Arbitrum bridge contract.
    /// @param _maxSubmissionCost Max gas deducted from user's L2 balance to cover base submission fee
    /// @param _excessFeeRefundAddress Address to refund any excess fee to
    /// @param _gasLimit Max gas deducted from user's L2 balance to cover L2 execution. Should not be set to 1 (magic value used to trigger the RetryableData error)
    /// @param _maxFeePerGas price bid for L2 execution. Should not be set to 1 (magic value used to trigger the RetryableData error)
    function route(
        uint256 _epoch,
        bytes32 _stateroot,
        uint256 _inboxIndex,
        uint256 _maxSubmissionCost,
        address _excessFeeRefundAddress,
        uint256 _gasLimit,
        uint256 _maxFeePerGas
    ) external;
}
