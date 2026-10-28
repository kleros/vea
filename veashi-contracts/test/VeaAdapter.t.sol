// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VeaAdapter} from "../src/adapters/vea/VeaAdapter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";

/// @notice The Vea adapter stores a message only when the outbox delivers it from the configured reporter.
contract VAVeaAdapterTest is VeashiTestBase {
    address internal veaOutbox = makeAddr("veaOutbox");
    address internal storyReporter = makeAddr("storyVeaReporter");
    VeaAdapter internal adapter;

    function setUp() public override {
        super.setUp();
        adapter = new VeaAdapter(veaOutbox, STORY, governor);
        vm.prank(governor);
        adapter.setReporter(storyReporter);
    }

    function _data(uint256 id, bytes32 hash) internal pure returns (bytes memory) {
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        ids[0] = id;
        hashes[0] = hash;
        return abi.encode(ids, hashes);
    }

    function test_OnlyOutboxDelivers() public {
        bytes memory data = _data(1, keccak256("m"));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(VeaAdapter.InvalidVeaOutbox.selector, stranger, veaOutbox));
        adapter.receiveMessage(storyReporter, data);

        // The reporter's address calling on this chain is not the outbox either.
        vm.prank(storyReporter);
        vm.expectRevert(abi.encodeWithSelector(VeaAdapter.InvalidVeaOutbox.selector, storyReporter, veaOutbox));
        adapter.receiveMessage(storyReporter, data);

        assertEq(adapter.getHash(STORY, 1), bytes32(0));
    }

    /// The revert names the actual sender first and the configured reporter second, as the error declares.
    function test_WrongSenderRevertsNamingSenderThenReporter() public {
        vm.prank(veaOutbox);
        vm.expectRevert(abi.encodeWithSelector(VeaAdapter.InvalidReporter.selector, stranger, storyReporter));
        adapter.receiveMessage(stranger, _data(1, keccak256("m")));
        assertEq(adapter.getHash(STORY, 1), bytes32(0));
    }

    /// With no reporter set only a zero source sender passes; Vea cannot deliver one: no contract sends as address(0).
    function test_UnsetReporterRejectsEveryNonZeroSender() public {
        VeaAdapter unset = new VeaAdapter(veaOutbox, STORY, governor);
        assertEq(unset.REPORTER(), address(0));

        address[2] memory senders = [storyReporter, stranger];
        for (uint256 i = 0; i < senders.length; i++) {
            vm.prank(veaOutbox);
            vm.expectRevert(abi.encodeWithSelector(VeaAdapter.InvalidReporter.selector, senders[i], address(0)));
            unset.receiveMessage(senders[i], _data(1, keccak256("m")));
        }

        vm.prank(veaOutbox);
        unset.receiveMessage(address(0), _data(1, keccak256("m")));
        assertEq(unset.getHash(STORY, 1), keccak256("m"));
    }

    function test_DeliveryStoredUnderSourceChainId() public {
        uint256[] memory ids = new uint256[](2);
        bytes32[] memory hashes = new bytes32[](2);
        ids[0] = 7;
        ids[1] = 8;
        hashes[0] = keccak256("a");
        hashes[1] = keccak256("b");

        vm.prank(veaOutbox);
        adapter.receiveMessage(storyReporter, abi.encode(ids, hashes));

        assertEq(adapter.getHash(STORY, 7), hashes[0]);
        assertEq(adapter.getHash(STORY, 8), hashes[1]);
        assertEq(adapter.getHash(ARBITRUM, 7), bytes32(0));
    }
}
