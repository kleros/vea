// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere, @hrishibhat, @adi274]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "../../arbitrumToEth/VeaOutboxArbToEth.sol";
import "../../canonical/arbitrum/IArbSys.sol";

contract VeaOutboxMockArbToEth is VeaOutboxArbToEth {
    IArbSys public immutable arbSys;

    /// Note: Access restricted to arbitrum canonical bridge.
    /// @dev Resolves any challenge of the optimistic claim for '_epoch'.
    /// @param _epoch The epoch to verify.
    /// @param _stateRoot The true state root for the epoch.
    function resolveDisputedClaim(
        uint256 _epoch,
        bytes32 _stateRoot,
        Claim memory _claim
    ) external override OnlyBridgeRunning {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");

        require(msg.sender == address(arbSys), "Not from bridge.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;

            if (_stateRoot != bytes32(0)) {
                stateRoot = _stateRoot;
            }
        }

        if (claimHashes[_epoch] == hashClaim(_claim)) {
            if (_claim.stateRoot == _stateRoot) {
                _claim.honest = Party.Claimer;
            } else if (_claim.challenger != address(0)) {
                _claim.honest = Party.Challenger;
            }
            claimHashes[_epoch] = hashClaim(_claim);
        }
    }

    /// @dev Constructor.
    /// Note: epochPeriod must match the VeaInboxArbToEth contract deployment on Arbitrum, since it's on a different chain, we can't read it and trust the deployer to set a correct value
    /// @param _arbSys The mocked ArbSys.
    /// @param _deposit The deposit amount to submit a claim in wei.
    /// @param _epochPeriod The duration of each epoch.
    /// @param _minChallengePeriod The minimum time window to challenge a claim.
    /// @param _timeoutEpochs The epochs before the bridge is considered shutdown.
    /// @param _veaInboxArbToEth The address of the inbox contract on Arbitrum.
    /// @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
    constructor(
        IArbSys _arbSys,
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _minChallengePeriod,
        uint256 _timeoutEpochs,
        address _veaInboxArbToEth,
        address _bridge,
        uint256 _maxMissingBlocks
    )
        VeaOutboxArbToEth(
            _deposit,
            _epochPeriod,
            _minChallengePeriod,
            _timeoutEpochs,
            _veaInboxArbToEth,
            _bridge,
            _maxMissingBlocks
        )
    {
        arbSys = _arbSys;
    }
}
