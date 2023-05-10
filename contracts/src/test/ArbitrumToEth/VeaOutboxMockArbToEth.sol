// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere, @hrishibhat, @adi274]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

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
        Claim memory claim
    ) external override OnlyBridgeRunning {
        require(
            claimHashes[_epoch] ==
                keccak256(
                    abi.encodePacked(
                        claim.stateRoot,
                        claim.claimer,
                        claim.timestamp,
                        claim.blocknumber,
                        claim.honest,
                        claim.challenger
                    )
                ),
            "Invalid claim."
        );

        require(msg.sender == address(arbSys), "Not from bridge.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;

            if (_stateRoot != bytes32(0)) {
                stateRoot = _stateRoot;
            }
        }

        if (claimHashes[_epoch] == hashClaim(claim)) {
            if (claim.stateRoot == _stateRoot) {
                claim.honest = Party.Claimer;
            } else if (claim.challenger != address(0)) {
                claim.honest = Party.Challenger;
            }
            claimHashes[_epoch] = hashClaim(claim);
        }
    }

    /// @dev Constructor.
    /// @param _arbSys The mocked IArbSys.
    /// @param _deposit The deposit amount to submit a claim in wei.
    /// @param _epochPeriod The duration of each epoch.
    /// @param _challengePeriod The duration of the period allowing to challenge a claim.
    /// @param _timeoutEpochs The epochs before the bridge is considered shutdown.
    /// @param _epochClaimDelay The number of epochs a claim can be submitted for.
    /// @param _veaInbox The address of the inbox contract on Arbitrum.
    /// @param _inbox The address of the inbox contract on Ethereum.
    /// @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
    constructor(
        IArbSys _arbSys,
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _timeoutEpochs,
        uint256 _epochClaimDelay,
        address _veaInbox,
        address _inbox,
        uint256 _maxMissingBlocks
    )
        VeaOutboxArbToEth(
            _deposit,
            _epochPeriod,
            _challengePeriod,
            _timeoutEpochs,
            _epochClaimDelay,
            _veaInbox,
            _inbox,
            _maxMissingBlocks
        )
    {
        arbSys = _arbSys;
    }
}
