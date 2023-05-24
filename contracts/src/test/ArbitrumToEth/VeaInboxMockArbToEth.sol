// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere, @adi274]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../../arbitrumToEth/VeaInboxArbToEth.sol";

contract VeaInboxMockArbToEth is VeaInboxArbToEth {
    IArbSys public immutable arbSys;

    // **************************************** //
    // *     Arbitrum Sender Specific         * //
    // **************************************** //

    /// @dev Sends the state root using Arbitrum's canonical bridge.
    function sendSnapshot(uint256 _epochSnapshot, Claim calldata _claim) external override {
        uint256 epoch = uint256(block.timestamp) / epochPeriod;
        require(_epochSnapshot <= epoch, "Epoch in the future.");
        bytes memory data = abi.encodeCall(
            IVeaOutboxOnL1.resolveDisputedClaim,
            (_epochSnapshot, snapshots[_epochSnapshot], _claim)
        );

        bytes32 ticketID = bytes32(arbSys.sendTxToL1(veaOutboxArbToEth, data));

        emit SnapshotSent(_epochSnapshot, ticketID);
    }

    /// @dev Constructor.
    /// @param _arbSys The mocked IArbSys.
    /// @param _epochPeriod The duration between epochs.
    /// @param _veaOutbox The vea outbox on Ethereum to the receiving chain.
    constructor(IArbSys _arbSys, uint256 _epochPeriod, address _veaOutbox) VeaInboxArbToEth(_epochPeriod, _veaOutbox) {
        arbSys = _arbSys;
    }
}
