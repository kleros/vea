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
 * @dev Interface of the Vea Router on Ethereum L1 which routes messages to L2s like Arbitrum, Optimism, Base, Specular where storage is expensive.
 */
interface IRouterToL2 {
    /**
     * Note: Access restricted to canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for 'epoch' using the canonical bridge.
     * @param epoch The epoch to verify.
     * @param stateRoot The true state root for the epoch.
     */
    function route(uint256 epoch, bytes32 stateRoot) external;
}
