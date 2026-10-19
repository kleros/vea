// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.0;

import {IAdapter} from "./IAdapter.sol";

interface IReporter {
    error NotYaho(address sender, address expectedYaho);
    error InvalidMessageArrays(uint256 messageIdsLength, uint256 messageHashesLength);
    error DispatcherNotSet();
    error MessageIdMismatch(uint256 messageId, uint256 expectedMessageId);
    error MessageNotVouched(address dispatcher, bytes32 messageHash);
    error MessageAlreadyDispatched(bytes32 messageHash);
    error DispatcherReplaced(address dispatcher, address newDispatcher);

    /**
     * @dev Emitted when the governor sets the reporter's dispatcher.
     * @param dispatcher - The only contract whose vouched messages the reporter dispatches.
     */
    event DispatcherSet(address indexed dispatcher);

    /**
     * @dev Emitted when a message is dispatched to another chain.
     * @param targetChainId - The target chain's identifier associated with the dispatched message.
     * @param adapter - The adapter address associated with the dispatched message.
     * @param messageId - The message identifier associated with the dispatched message.
     * @param messageHash - The dispatched message hash as a bytes32 value.
     */
    event MessageDispatched(
        uint256 indexed targetChainId,
        IAdapter adapter,
        uint256 indexed messageId,
        bytes32 messageHash
    );

    /**
     * @dev Dispatches messages to a target chain using the specified adapter.
     * @param targetChainId - The target chain's Uint256 identifier.
     * @param adapter - The adapter instance to use.
     * @param messageIds - An array of Uint256 message identifiers.
     * @param messageHashes - An array of bytes32 message hashes.
     * @notice This function can be called only by Yaho, and only for messages the reporter's dispatcher vouches for.
     * A reporter dispatches each message once: a second entry for the same message reverts.
     * @return result - The result returned by the adapter as bytes.
     */
    function dispatchMessages(
        uint256 targetChainId,
        IAdapter adapter,
        uint256[] memory messageIds,
        bytes32[] memory messageHashes
    ) external returns (bytes32);
}
