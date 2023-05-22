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
 * @dev Interface of the Vea Router on Ethereum L1 which routes messages to alt-L1 chains like Gnosis, Polygon POS etc.
 */
interface IRouterToAltL1 {
    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Routes state root snapshots from arbitrum to gnosis
     * @param epoch The epoch to verify.
     * @param stateRoot The true state root for the epoch.
     * @param claim The claim associated with the epoch.
     */
    function route(uint256 epoch, bytes32 stateRoot, Claim memory claim) external;
}
