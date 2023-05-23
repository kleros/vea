// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../types/VeaClaim.sol";

/**
 * @dev Interface of the Vea Router on an intermediary chain which routes messages to an L1 chain like Ethereum, Gnosis, Polygon POS etc. as a final destination.
 * @dev eg. L2 on Gnosis -> Gnosis (L1) -> Ethereum (L1), the IRouterToL1 will be deployed on Gnosis (L1) routing messages to Ethereum (L1).
 * @dev eg. L2 on Ethereum -> Ethereum (L1) -> Gnosis (L1), the IRouterToL1 will be deployed on Ethereum (L1) routing messages to Gnosis (L1).
 */
interface IRouterToL1 {
    /**
     * Note: Access restricted to canonical sending-chain bridge.
     * @dev Routes state root snapshots through intermediary chains to the final destination L1 chain.
     * @param _epoch The epoch to verify.
     * @param _stateRoot The true state root for the epoch.
     * @param _claim The claim associated with the epoch.
     */
    function route(uint256 _epoch, bytes32 _stateRoot, Claim memory _claim) external;
}
