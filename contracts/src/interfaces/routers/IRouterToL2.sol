// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

/**
 * @dev Interface of the Vea Router intended to be deployed on an intermediary chain which routes messages to L2s where calldata is the primary cost (eg Arbitrum, Optimism, Specular) as a final destination.
 * @dev eg. Gnosis (L1) -> Ethereum (L1) -> Arbitrum (L2), the IRouterToL2 will be deployed on Ethereum (L1) routing messages to Arbitrum (L2).
 * @dev eg. Arbitrum (L2) -> Ethereum (L1) -> Optimism (L2), the IRouterToL2 will be deployed on Ethereum (L1) routing messages to Optimism (L2).
 * Note: Router specifies L2 as the final destination, but can route to an L1 as an intermediary
 *       eg Arbitrum (L2) -> Ethereum (L1) -> Gnosis (L1) -> L2 on Gnosis (L2), the IRouterToL2 will be deployed on Ethereum (L1) routing messages to Gnosis (L1),
 *       which will in turn have a IRouterToL2 deployment routing messages to an L2 on Gnosis (L2) as a final destination.
 */
interface IRouterToL2 {
    /**
     * Note: Access restricted to canonical sending-chain bridge.
     * @dev Resolves any challenge of the optimistic claim for 'epoch' using the canonical bridge.
     * @param _epoch The epoch to verify.
     * @param _stateRoot The true state root for the epoch.
     */
    function route(uint256 _epoch, bytes32 _stateRoot) external;
}
