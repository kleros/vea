// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "../types/VeaClaim.sol";

/// @dev Interface of the Vea Router which routes messages to Gnosis through the AMB.
/// @dev eg. L2 on Ethereum -> Ethereum (L1) -> Gnosis (L1), the IRouterToL1 will be deployed on Ethereum (L1) routing messages to Gnosis (L1).
interface IRouterToGnosis {
    /// @dev Routes state root snapshots through intermediary chains to the final destination L1 chain.
    /// Note: Access restricted to canonical sending-chain bridge.
    /// @param _epoch The epoch to verify.
    /// @param _stateRoot The true state root for the epoch.
    /// @param _gasLimit The gas limit for the AMB message.
    /// @param _claim The claim associated with the epoch.
    function route(uint256 _epoch, bytes32 _stateRoot, uint256 _gasLimit, Claim memory _claim) external;
}
