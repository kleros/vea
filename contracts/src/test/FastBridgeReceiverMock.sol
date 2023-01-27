// SPDX-License-Identifier: MIT

/**
 *  @authors: [@adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../FastBridgeReceiverOnEthereum.sol";

/**
 * Fast Bridge Receiver
 * Counterpart of `Fast Sender`
 */
contract FastBridgeReceiverOnEthereumMock is FastBridgeReceiverOnEthereum {
    // **************************************** //
    // *        Hardhat Specific              * //
    // **************************************** //
    function isSentBySafeBridge() internal view override returns (bool) {
        IOutbox outbox = IOutbox(inbox.bridge().activeOutbox());
        return outbox.l2ToL1Sender() == fastBridgeSender;
    }

    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        address _fastBridgeSender,
        address _inbox // Ethereum receiver specific
    ) FastBridgeReceiverOnEthereum(_deposit, _epochPeriod, _challengePeriod, _fastBridgeSender, _inbox) {}
}
