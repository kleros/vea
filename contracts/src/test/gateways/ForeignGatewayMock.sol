// SPDX-License-Identifier: MIT

/**
 *  @authors: [@adi274]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "./IForeignGatewayMock.sol";

/**
 * Foreign Gateway
 * Counterpart of `HomeGateway`
 */
contract ForeignGatewayMock is IForeignGatewayMock {
    function fastBridgeReceiver() external view override returns (IFastBridgeReceiver) {
        revert("Not Implemented");
    }

    function senderChainID() external view override returns (uint256) {
        revert("Not Implemented");
    }

    function senderGateway() external view override returns (address) {
        revert("Not Implemented");
    }

    /**
     * @dev Changes the fastBridge, useful to increase the claim deposit.
     * @param _fastBridgeReceiver The address of the new fastBridge.
     * @param _gracePeriod The duration to accept messages from the deprecated bridge (if at all).
     */
    function changeFastbridge(IFastBridgeReceiver _fastBridgeReceiver, uint256 _gracePeriod) external {
        revert("Not Implemented");
    }

    /**
     * @dev Changes the `feeForJuror` property value of a specified subcourt.
     * @param _subcourtID The ID of the subcourt.
     * @param _feeForJuror The new value for the `feeForJuror` property value.
     */
    function changeSubcourtJurorFee(uint96 _subcourtID, uint256 _feeForJuror) external {
        revert("Not Implemented");
    }

    /**
     * @dev Creates the `feeForJuror` property value for a new subcourt.
     * @param _feeForJuror The new value for the `feeForJuror` property value.
     */
    function createSubcourtJurorFee(uint256 _feeForJuror) external {
        revert("Not Implemented");
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    function createDispute(
        uint256 _choices,
        bytes calldata _extraData
    ) external payable override returns (uint256 disputeID) {
        revert("Not Implemented");
    }

    function arbitrationCost(bytes calldata _extraData) public view override returns (uint256 cost) {
        revert("Not Implemented");
    }

    /**
     * Relay the rule call from the home gateway to the arbitrable.
     */
    function relayRule(
        address _messageSender,
        bytes32 _disputeHash,
        uint256 _ruling,
        address _relayer
    ) external override {
        revert("Not Implemented");
    }

    function withdrawFees(bytes32 _disputeHash) external override {
        revert("Not Implemented");
    }

    function disputeHashToForeignID(bytes32 _disputeHash) external view override returns (uint256) {
        revert("Not Implemented");
    }

    function receiveMessage(address _msgSender) external {
        revert("Not Implemented");
    }
}
