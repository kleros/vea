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
import "./IHomeGatewayMock.sol";

/**
 * Home Gateway
 * Counterpart of `ForeignGateway`
 */
contract HomeGatewayMock is IHomeGatewayMock {
    function fastBridgeSender() external view override returns (IFastBridgeSender) {
        revert("Not Implemented");
    }

    function receiverChainID() external view override returns (uint256) {
        revert("Not Implemented");
    }

    function receiverGateway() external view override returns (address) {
        revert("Not Implemented");
    }

    /**
     * @dev Changes the fastBridge, useful to increase the claim deposit.
     * @param _fastBridgeSender The address of the new fastBridge.
     */
    function changeFastbridge(IFastBridgeSender _fastBridgeSender) external {
        revert("Not Implemented");
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /**
     * @dev Provide the same parameters as on the originalChain while creating a dispute. Providing incorrect parameters will create a different hash than on the originalChain and will not affect the actual dispute/arbitrable's ruling.
     * @param _originalChainID originalChainId
     * @param _originalBlockHash originalBlockHash
     * @param _originalDisputeID originalDisputeID
     * @param _choices number of ruling choices
     * @param _extraData extraData
     * @param _arbitrable arbitrable
     */
    function relayCreateDispute(
        uint256 _originalChainID,
        bytes32 _originalBlockHash,
        uint256 _originalDisputeID,
        uint256 _choices,
        bytes calldata _extraData,
        address _arbitrable
    ) external payable override {
        revert("Not Implemented");
    }

    function rule(uint256 _disputeID, uint256 _ruling) external {
        revert("Not Implemented");
    }

    function disputeHashToHomeID(bytes32 _disputeHash) external view override returns (uint256) {
        revert("Not Implemented");
    }
}
