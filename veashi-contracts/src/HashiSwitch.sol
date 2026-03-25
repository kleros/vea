// SPDX-License-Identifier: MIT

/**
 *  @authors: [@mani99brar]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */
pragma solidity ^0.8.18;

import "@hashi/interfaces/IYaho.sol";

/**
 * @title Lightbulb
 * @dev A switch on arbitrum turning a light on and off on arbitrum with the Vea bridge.
 */
contract Switch {
    IYaho public yaho;

    constructor(address _yaho) {
        yaho = IYaho(_yaho);
    }
    uint256 messageIndex;
    /**
     * @dev The Fast Bridge participants watch for these events to decide if a challenge should be submitted.
     * @param messageId The id of the message sent to the lightbulb.
     * @param lightBulbOwner The address of the owner of the lightbulb on the L2 side.
     */

    event LightBulbToggled(uint256 indexed messageId, address indexed lightBulbOwner);

    function turnOnLightBulb(
        uint32 _lightBulbChainId,
        address _targetAddress,
        uint256 _threshold,
        IReporter[] memory _reporters,
        IAdapter[] memory _adapters
    ) external payable {
        bytes memory _msgData = abi.encode(msg.sender);

        (uint256 msgId, ) = yaho.dispatchMessageToAdapters(
            _lightBulbChainId,
            _threshold,
            _targetAddress,
            _msgData,
            _reporters,
            _adapters
        );
        emit LightBulbToggled(msgId, msg.sender);
    }
}
