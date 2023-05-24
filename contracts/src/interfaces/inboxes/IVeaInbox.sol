// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

interface IVeaInbox {
    /// @dev Sends an arbitrary message to receiving chain.
    /// Note: Calls authenticated by receiving gateway checking the sender argument.
    /// @param _to The cross-domain contract address which receives the calldata.
    /// @param _fnSelection The function selector of the receiving contract.
    /// @param _data The message calldata, abi.encode(...)
    /// @return msgId The index of the message in the inbox, as a message Id, needed to relay the message.
    function sendMessage(address _to, bytes4 _fnSelection, bytes memory _data) external returns (uint64 msgId);

    /// @dev Snapshots can be saved a maximum of once per epoch.
    ///      Saves snapshot of state root.
    ///      `O(log(count))` where count number of messages in the inbox.
    function saveSnapshot() external;
}
