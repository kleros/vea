// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

interface IVeaInbox {
    /**
     * Note: Calls authenticated by receiving gateway checking the sender argument.
     * @dev Sends an arbitrary message to Ethereum.
     * @param to The cross-domain contract address which receives the calldata.
     * @param data The message calldata, abi.encodeWithSelector(...)
     * @return msgId The index of the message in the inbox, as a message Id, needed to relay the message.
     */
    function sendMsg(address to, bytes memory data) external returns (uint64 msgId);
}
