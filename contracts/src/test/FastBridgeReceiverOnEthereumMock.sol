// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere, @hrishibhat, @adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../FastBridgeReceiverOnEthereum.sol";
import "../canonical/arbitrum/IArbSys.sol";

contract FastBridgeReceiverOnEthereumMock is FastBridgeReceiverOnEthereum {
    IArbSys public immutable arbSys;

    // **************************************** //
    // *     Ethereum Receiver Specific       * //
    // **************************************** //

    function isSentBySafeBridge() internal view override returns (bool) {
        IOutbox outbox = IOutbox(inbox.bridge().activeOutbox());
        return msg.sender == address(arbSys) && outbox.l2ToL1Sender() == safeBridgeSender;
    }

    /**
     * @dev Constructor.
     * @param _arbSys The mocked IArbSys.
     * @param _deposit The deposit amount to submit a claim in wei.
     * @param _epochPeriod The duration of each epoch.
     * @param _challengePeriod The duration of the period allowing to challenge a claim.
     * @param _safeBridgeSender The address of the Safe Bridge Sender on the connecting chain.
     * @param _inbox Ethereum receiver specific: The address of the inbox contract on Ethereum.
     */
    constructor(
        IArbSys _arbSys,
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        address _safeBridgeSender,
        address _inbox // Ethereum receiver specific
    ) FastBridgeReceiverOnEthereum(_deposit, _epochPeriod, _challengePeriod, _safeBridgeSender, _inbox) {
        arbSys = _arbSys;
    }
}
