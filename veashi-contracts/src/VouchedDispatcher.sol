// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.24;

import {Yaho} from "@hashi/Yaho.sol";
import {Message} from "@hashi/interfaces/IMessage.sol";
import {IReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter} from "@hashi/interfaces/IAdapter.sol";
import {IDispatchVoucher} from "./interfaces/IDispatchVoucher.sol";

/// @title VouchedDispatcher
/// @dev Inherited by gateways: dispatches a message through Hashi's Yaho and, for the length of that call,
/// vouches for its hash so the reporters (whose dispatcher this contract is) agree to pay for it.
/// It declares no storage variable and no constructor, so an upgradeable gateway can inherit it without
/// moving its storage layout; the in-flight hash lives in transient storage at a namespaced slot.
abstract contract VouchedDispatcher is IDispatchVoucher {
    /// @dev keccak256("veashi.VouchedDispatcher.dispatchingHash") - 1
    bytes32 private constant DISPATCHING_HASH_SLOT = 0x82a237359f60149f0fec9bbb73410f08c7e6744684477bcc130500e3e4f25aa2;

    error NestedDispatch();
    error UnexpectedMessageId(uint256 messageId, uint256 expectedMessageId);

    /// @dev The Yaho this contract dispatches through.
    function _yaho() internal view virtual returns (address);

    /// @inheritdoc IDispatchVoucher
    function isDispatching(bytes32 messageHash) external view returns (bool) {
        bytes32 dispatchingHash = _dispatchingHash();
        return dispatchingHash != bytes32(0) && dispatchingHash == messageHash;
    }

    /// @dev Dispatches a message through `Yaho.dispatchMessageToAdapters`, vouching for its hash meanwhile.
    function _dispatchVouched(
        uint256 targetChainId,
        uint256 threshold,
        address receiver,
        bytes memory data,
        IReporter[] memory reporters,
        IAdapter[] memory adapters
    ) internal returns (uint256 messageId, bytes32[] memory reportersReceipts) {
        if (_dispatchingHash() != bytes32(0)) revert NestedDispatch();
        Yaho yaho = Yaho(_yaho());

        // The message exactly as Yaho will build it: Yaho reads `currentNonce` before incrementing it.
        Message memory message = Message(
            yaho.currentNonce(),
            targetChainId,
            threshold,
            address(this),
            receiver,
            data,
            reporters,
            adapters
        );
        bytes32 messageHash = yaho.calculateMessageHash(message);
        uint256 expectedMessageId = yaho.calculateMessageId(block.chainid, address(yaho), messageHash);

        _setDispatchingHash(messageHash);
        (messageId, reportersReceipts) = yaho.dispatchMessageToAdapters(
            targetChainId,
            threshold,
            receiver,
            data,
            reporters,
            adapters
        );
        if (messageId != expectedMessageId) revert UnexpectedMessageId(messageId, expectedMessageId);
        _setDispatchingHash(bytes32(0));
    }

    function _dispatchingHash() private view returns (bytes32 messageHash) {
        bytes32 slot = DISPATCHING_HASH_SLOT;
        assembly {
            messageHash := tload(slot)
        }
    }

    function _setDispatchingHash(bytes32 messageHash) private {
        bytes32 slot = DISPATCHING_HASH_SLOT;
        assembly {
            tstore(slot, messageHash)
        }
    }
}
