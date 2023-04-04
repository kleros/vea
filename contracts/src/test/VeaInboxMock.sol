// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere, @adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../VeaInbox.sol";

contract VeaInboxMock is VeaInbox {
    IArbSys public immutable arbSys;

    // **************************************** //
    // *     Arbitrum Sender Specific         * //
    // **************************************** //

    /**
     * @dev Sends the state root using Arbitrum's canonical bridge.
     */
    function sendStaterootSnapshot(uint64 _epochSnapshot) external override {
        uint64 epoch = uint64(block.timestamp) / epochPeriod;
        require(_epochSnapshot <= epoch, "Epoch in the future.");
        bytes memory data = abi.encodeWithSelector(
            IChallengeResolver.resolveChallenge.selector,
            _epochSnapshot,
            stateRootSnapshots[_epochSnapshot]
        );

        bytes32 ticketID = bytes32(arbSys.sendTxToL1(receiver, data));

        emit StaterootSent(_epochSnapshot, ticketID);
    }

    /**
     * @dev Constructor.
     * @param _arbSys The mocked IArbSys.
     * @param _epochPeriod The duration between epochs.
     * @param _veaOutbox The vea outbox on Ethereum to the receiving chain.
     */
    constructor(
        IArbSys _arbSys,
        uint64 _epochPeriod,
        address _veaOutbox
    ) VeaInbox(_epochPeriod, _veaOutbox) {
        arbSys = _arbSys;
    }
}
