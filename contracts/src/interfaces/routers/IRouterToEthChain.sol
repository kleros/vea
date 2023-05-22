// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

import "../outboxes/IVeaOutboxEthChain.sol";

pragma solidity 0.8.18;

interface IRouterToEthChain {
    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Routes state root snapshots from arbitrum to gnosis
     * @param epoch The epoch to verify.
     * @param stateRoot The true state root for the epoch.
     * @param claim The claim associated with the epoch.
     */
    function route(uint256 epoch, bytes32 stateRoot, IVeaOutboxEthChain.Claim memory claim) external;
}
