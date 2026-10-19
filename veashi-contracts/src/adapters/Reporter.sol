// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.28;

import {MessageIdCalculator} from "@hashi/utils/MessageIdCalculator.sol";
import {IReporter} from "../interfaces/IReporter.sol";
import {IAdapter} from "../interfaces/IAdapter.sol";
import {IDispatchVoucher} from "../interfaces/IDispatchVoucher.sol";
import {Governed} from "../governance/Governed.sol";
import {KeeperGoverned} from "../governance/KeeperGoverned.sol";

abstract contract Reporter is IReporter, KeeperGoverned, MessageIdCalculator {
    address public immutable YAHO;
    /// @dev The one contract (a gateway) whose vouched messages this reporter pays to dispatch.
    address public dispatcher;
    /// @dev The last hash this reporter paid for; cleared at the end of every transaction.
    /// The dispatcher vouches for one hash at a time, so a repeat of a message comes right after it.
    bytes32 private transient _lastDispatchedHash;

    modifier onlyYaho() {
        if (msg.sender != YAHO) revert NotYaho(msg.sender, YAHO);
        _;
    }

    constructor(address yaho, address governor_, address keeper_) Governed(governor_) KeeperGoverned(keeper_) {
        YAHO = yaho;
    }

    /// @notice Sets the only dispatcher; replacing it makes an in-flight dispatch of the old one revert.
    function setDispatcher(address dispatcher_) external onlyByGovernor {
        dispatcher = dispatcher_;
        emit DispatcherSet(dispatcher_);
    }

    /// @inheritdoc IReporter
    function dispatchMessages(
        uint256 targetChainId,
        IAdapter adapter,
        uint256[] memory messageIds,
        bytes32[] memory messageHashes
    ) external onlyYaho returns (bytes32) {
        if (messageIds.length == 0 || messageIds.length != messageHashes.length) {
            revert InvalidMessageArrays(messageIds.length, messageHashes.length);
        }
        address dispatcher_ = dispatcher;
        if (dispatcher_ == address(0)) revert DispatcherNotSet();
        for (uint256 i = 0; i < messageIds.length; ) {
            uint256 expectedMessageId = calculateMessageId(block.chainid, YAHO, messageHashes[i]);
            if (messageIds[i] != expectedMessageId) revert MessageIdMismatch(messageIds[i], expectedMessageId);
            if (!IDispatchVoucher(dispatcher_).isDispatching(messageHashes[i])) {
                revert MessageNotVouched(dispatcher_, messageHashes[i]);
            }
            // Yaho calls every reporter entry, so a reporter listed twice would pay twice for one message.
            if (messageHashes[i] == _lastDispatchedHash) revert MessageAlreadyDispatched(messageHashes[i]);
            _lastDispatchedHash = messageHashes[i];
            emit MessageDispatched(targetChainId, adapter, messageIds[i], messageHashes[i]);
            unchecked {
                ++i;
            }
        }
        bytes32 result = _dispatch(targetChainId, address(adapter), messageIds, messageHashes);
        // The bridge call may reach the governor: a dispatcher replaced meanwhile voids this dispatch.
        if (dispatcher != dispatcher_) revert DispatcherReplaced(dispatcher_, dispatcher);
        return result;
    }

    function _dispatch(
        uint256 targetChainId,
        address adapter,
        uint256[] memory ids,
        bytes32[] memory hashes
    ) internal virtual returns (bytes32);
}
