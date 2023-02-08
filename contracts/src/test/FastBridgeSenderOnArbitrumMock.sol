// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere, @adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../FastBridgeSender.sol";

contract FastBridgeSenderOnArbitrumMock is FastBridgeSender {
    IArbSys public immutable arbSys;

    // **************************************** //
    // *     Arbitrum Sender Specific         * //
    // **************************************** //

    function _sendSafe(address _receiver, bytes memory _calldata) internal override returns (bytes32) {
        uint256 ticketID = arbSys.sendTxToL1(_receiver, _calldata);
        return bytes32(ticketID);
    }

    /**
     * @dev Constructor.
     * @param _arbSys The mocked IArbSys.
     * @param _epochPeriod The duration between epochs.
     * @param _fastBridgeReceiver The the Safe Bridge Router on Ethereum to the receiving chain.
     */
    constructor(
        IArbSys _arbSys,
        uint256 _epochPeriod,
        address _fastBridgeReceiver
    ) FastBridgeSender(_epochPeriod, _fastBridgeReceiver) {
        arbSys = _arbSys;
    }
}
