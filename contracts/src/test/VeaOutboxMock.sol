// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere, @hrishibhat, @adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../VeaOutbox.sol";
import "../canonical/arbitrum/IArbSys.sol";

contract VeaOutboxMock is VeaOutbox {
    IArbSys public immutable arbSys;

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param _epoch The epoch to verify.
     * @param _stateRoot The true state root for the epoch.
     */
    function resolveChallenge(uint256 _epoch, bytes32 _stateRoot) external override {
        require(msg.sender == address(arbSys), "Not from bridge.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;
            stateRoot = _stateRoot;
        }

        if (claims[_epoch].bridger != address(0)) {
            if (_stateRoot == claims[_epoch].stateroot) {
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
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _numEpochTimeout,
        uint256 _epochClaimWindow,
        address _sender,
        address _inbox // Ethereum receiver specific
    ) VeaOutbox(_deposit, _epochPeriod, _challengePeriod, _numEpochTimeout, _epochClaimWindow, _sender, _inbox) {
        arbSys = _arbSys;
    }
}