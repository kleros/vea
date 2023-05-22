// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

interface IVeaInbox {
    /**
     * @dev Sends an arbitrary message to receiving chain.
     * Note: Calls authenticated by receiving gateway checking the sender argument.
     * @param to The cross-domain contract address which receives the calldata.
     * @param fnSelection The function selector of the receiving contract.
     * @param data The message calldata, abi.encode(...)
     * @return msgId The index of the message in the inbox, as a message Id, needed to relay the message.
     */
    function sendMessage(address to, bytes4 fnSelection, bytes memory data) external returns (uint64 msgId);

    /**
     * Saves snapshot of state root.
     * `O(log(count))` where count number of messages in the inbox.
     * @dev Snapshots can be saved a maximum of once per epoch.
     */
    function saveSnapshot() external;
}
