// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Yaho} from "@hashi/Yaho.sol";
import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {Message} from "@hashi/interfaces/IMessage.sol";

/// @dev Records what Hashi's Yaho passes to a reporter.
contract RecordingReporter {
    uint256 public calls;
    uint256 public lastValue;
    uint256 public lastId;
    bytes32 public lastHash;

    function dispatchMessages(
        uint256,
        IHashiAdapter,
        uint256[] memory messageIds,
        bytes32[] memory messageHashes
    ) external payable returns (bytes32) {
        calls++;
        lastValue = msg.value;
        lastId = messageIds[0];
        lastHash = messageHashes[0];
        return bytes32(0);
    }
}

/// @notice Probes the three properties of the real Yaho that PRD 1 relies on.
contract YahoProbeTest is Test {
    Yaho internal yaho;
    RecordingReporter internal reporter;

    function setUp() public {
        yaho = new Yaho();
        reporter = new RecordingReporter();
    }

    function _lists() internal view returns (IHashiReporter[] memory reporters, IHashiAdapter[] memory adapters) {
        reporters = new IHashiReporter[](1);
        reporters[0] = IHashiReporter(address(reporter));
        adapters = new IHashiAdapter[](1);
        adapters[0] = IHashiAdapter(address(0xADA));
    }

    function test_YahoForwardsNoValueReadsNonceAndStoresNoPendingHash() public {
        (IHashiReporter[] memory reporters, IHashiAdapter[] memory adapters) = _lists();
        // Advance the nonce so a nonce of zero is not taken for the earlier value by accident.
        yaho.dispatchMessage(10, 1, address(0xBEEF), "first", reporters, adapters);
        uint256 nonceBefore = yaho.currentNonce();
        assertEq(nonceBefore, 1);

        Message memory message = Message(
            nonceBefore,
            10,
            1,
            address(this),
            address(0xBEEF),
            "payload",
            reporters,
            adapters
        );
        bytes32 expectedHash = yaho.calculateMessageHash(message);

        vm.deal(address(this), 1 ether);
        (uint256 id, ) = yaho.dispatchMessageToAdapters{value: 1 ether}(
            10,
            1,
            address(0xBEEF),
            "payload",
            reporters,
            adapters
        );

        assertEq(reporter.calls(), 1);
        assertEq(reporter.lastValue(), 0, "Yaho forwarded value");
        assertEq(reporter.lastHash(), expectedHash, "message nonce is not the earlier currentNonce");
        assertEq(id, yaho.calculateMessageId(block.chainid, address(yaho), expectedHash));
        assertEq(reporter.lastId(), id);
        assertEq(yaho.currentNonce(), nonceBefore + 1);
        assertEq(yaho.getPendingMessageHash(id), bytes32(0), "dispatchMessageToAdapters stored a pending hash");
    }
}
