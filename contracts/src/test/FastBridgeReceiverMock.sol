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

/**
 * Fast Receiver On Ethereum
 * Counterpart of `FastSenderFromArbitrum`
 */
contract FastBridgeReceiverOnEthereumMock is FastBridgeReceiverOnEthereum {
    // **************************************** //
    // *                                      * //
    // *     Ethereum Receiver Specific       * //
    // *                                      * //
    // **************************************** //

    // ************************************* //
    // *              Views                * //
    // ************************************* //

    function isSentBySafeBridge() internal view override returns (bool) {
        IOutbox outbox = IOutbox(inbox.bridge().activeOutbox());
        return outbox.l2ToL1Sender() == safeBridgeSender;
    }

    /**
     * @dev Constructor.
     * @param _deposit The deposit amount to submit a claim in wei.
     * @param _epochPeriod The duration of each epoch.
     * @param _challengePeriod The duration of the period allowing to challenge a claim.
     * @param _safeBridgeSender The address of the Safe Bridge Sender on the connecting chain.
     * @param _inbox Ethereum receiver specific: The address of the inbox contract on Ethereum.
     */
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        address _safeBridgeSender,
        address _inbox // Ethereum receiver specific
    ) FastBridgeReceiverOnEthereum(_deposit, _epochPeriod, _challengePeriod, _safeBridgeSender, _inbox) {}
}
