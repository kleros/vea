// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere, @hrishibhat, @adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../../ArbToEth/VeaOutboxArbToEth.sol";
import "../../canonical/arbitrum/IArbSys.sol";

contract VeaOutboxMockArbToEth is VeaOutboxArbToEth {
    IArbSys public immutable arbSys;

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param _epoch The epoch to verify.
     * @param _stateRoot The true state root for the epoch.
     */
    function resolveDisputedClaim(uint256 _epoch, bytes32 _stateRoot) external override {
        require(msg.sender == address(arbSys), "Not from bridge.");

        if (_epoch > veaOutboxInfo.latestVerifiedEpoch) {
            veaOutboxInfo.latestVerifiedEpoch = uint32(_epoch);
            stateRoot = _stateRoot;
        }

        if (claims[_epoch].bridger != address(0)) {
            if (_stateRoot == claims[_epoch].stateRoot) {
                claims[_epoch].honest = true;
            } else {
                challenges[_epoch].honest = true;
            }
        }

        emit Verified(_epoch);
    }

    /**
     * @dev Constructor.
     * @param _arbSys The mocked IArbSys.
     * @param _deposit The deposit amount to submit a claim in wei.
     * @param _epochPeriod The duration of each epoch.
     * @param _challengePeriod The duration of the period allowing to challenge a claim.
     * @param _numEpochTimeout The number of epochs after which a claim is considered timed out.
     * @param _epochClaimWindow The number of epochs past which can be claimed.
     * @param _sender The address of the Safe Bridge Sender on the connecting chain.
     * @param _inbox Ethereum receiver specific: The address of the inbox contract on Ethereum.
     */
    constructor(
        IArbSys _arbSys,
        uint256 _deposit,
        uint64 _epochPeriod,
        uint64 _challengePeriod,
        uint64 _numEpochTimeout,
        uint64 _epochClaimWindow,
        address _sender,
        address _inbox
    )
        VeaOutboxArbToEth(
            _deposit,
            _epochPeriod,
            _challengePeriod,
            _numEpochTimeout,
            _epochClaimWindow,
            _sender,
            _inbox
        )
    {
        arbSys = _arbSys;
    }
}
