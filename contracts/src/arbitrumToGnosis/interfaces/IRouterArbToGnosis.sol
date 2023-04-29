// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

import "./IVeaOutboxArbToGnosis.sol";

pragma solidity 0.8.18;

interface IRouterArbToGnosis {
    /**
     * Note: Access restricted to canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for 'epoch' using the canonical bridge.
     * @param epoch The epoch to verify.
     * @param stateRoot The true state root for the epoch.
     */
    function route(uint256 epoch, bytes32 stateRoot, IVeaOutboxArbToGnosis.Claim memory claim) external;
}
