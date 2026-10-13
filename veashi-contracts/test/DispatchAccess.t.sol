// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {Message} from "@hashi/interfaces/IMessage.sol";
import {IYaho} from "@hashi/interfaces/IYaho.sol";
import {Governed} from "../src/governance/Governed.sol";
import {IReporter} from "../src/interfaces/IReporter.sol";
import {IAdapter} from "../src/interfaces/IAdapter.sol";
import {VouchedDispatcher} from "../src/VouchedDispatcher.sol";
import {Reporter} from "../src/adapters/Reporter.sol";
import {CCIPReporter} from "../src/adapters/chainlink/CCIPReporter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";
import "./utils/Mocks.sol";

/// @notice PRD 1.1-1.4 (P1): only the reporter's one dispatcher can spend its balance.
contract DispatchAccessTest is VeashiTestBase {
    address internal receiver = makeAddr("receiver");

    // ---------- the three spending paths of PRD 5.2, each with its positive control ----------

    /// Path 1: a direct `dispatchMessages` from an arbitrary caller.
    function test_DirectDispatchMessagesRevertsForArbitraryCaller() public {
        for (uint256 i = 0; i < reporters.length; i++) {
            (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(i);
            (, bytes32 messageHash, uint256 messageId) = _next(address(gateway), STORY, 1, receiver, "m", r, a);
            uint256[] memory ids = new uint256[](1);
            bytes32[] memory hashes = new bytes32[](1);
            ids[0] = messageId;
            hashes[0] = messageHash;

            vm.prank(stranger);
            vm.expectRevert(abi.encodeWithSelector(IReporter.NotYaho.selector, stranger, address(yaho)));
            reporters[i].dispatchMessages(STORY, IAdapter(adapters[i]), ids, hashes);

            _assertGatewayDispatchSucceeds(i);
        }
    }

    /// Path 2: `Yaho.dispatchMessageToAdapters` from an arbitrary address.
    function test_YahoDispatchMessageToAdaptersRevertsForArbitraryCaller() public {
        for (uint256 i = 0; i < reporters.length; i++) {
            (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(i);
            (, bytes32 messageHash, ) = _next(stranger, STORY, 1, receiver, "m", r, a);

            vm.prank(stranger);
            vm.expectRevert(
                abi.encodeWithSelector(IReporter.MessageNotVouched.selector, address(gateway), messageHash)
            );
            yaho.dispatchMessageToAdapters(STORY, 1, receiver, "m", r, a);

            _assertGatewayDispatchSucceeds(i);
        }
    }

    /// Path 3: `Yaho.dispatchMessage` then `relayMessagesToAdapters`.
    function test_YahoDispatchThenRelayRevertsForArbitraryCaller() public {
        for (uint256 i = 0; i < reporters.length; i++) {
            (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(i);
            (Message memory message, bytes32 messageHash, uint256 messageId) = _next(
                stranger,
                STORY,
                1,
                receiver,
                "m",
                r,
                a
            );
            vm.prank(stranger);
            assertEq(yaho.dispatchMessage(STORY, 1, receiver, "m", r, a), messageId);
            assertEq(yaho.getPendingMessageHash(messageId), messageHash);

            Message[] memory messages = new Message[](1);
            messages[0] = message;
            vm.prank(makeAddr("relayer"));
            vm.expectRevert(
                abi.encodeWithSelector(IReporter.MessageNotVouched.selector, address(gateway), messageHash)
            );
            yaho.relayMessagesToAdapters(messages);

            _assertGatewayDispatchSucceeds(i);
        }
    }

    /// Yaho's batch path passes several hashes; none is vouched for an arbitrary caller.
    function test_YahoBatchDispatchRevertsForArbitraryCaller() public {
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(0);
        (, bytes32 firstHash, ) = _next(stranger, STORY, 1, receiver, "a", r, a);
        uint256[] memory thresholds = new uint256[](2);
        address[] memory receivers = new address[](2);
        bytes[] memory data = new bytes[](2);
        thresholds[0] = thresholds[1] = 1;
        receivers[0] = receivers[1] = receiver;
        data[0] = "a";
        data[1] = "b";

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IReporter.MessageNotVouched.selector, address(gateway), firstHash));
        yaho.dispatchMessagesToAdapters(STORY, thresholds, receivers, data, r, a);
    }

    function _assertGatewayDispatchSucceeds(uint256 i) internal {
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(i);
        (, bytes32 messageHash, uint256 messageId) = _next(address(gateway), STORY, 1, receiver, "m", r, a);
        vm.expectEmit(address(reporters[i]));
        emit IReporter.MessageDispatched(STORY, IAdapter(adapters[i]), messageId, messageHash);
        (uint256 id, ) = gateway.dispatch(STORY, 1, receiver, "m", r, a);
        assertEq(id, messageId);
    }

    // ---------- VouchedDispatcher through the real Yaho ----------

    function test_VouchedDispatchThroughRealYahoSucceedsWithYahosId() public {
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _all();
        (Message memory message, bytes32 messageHash, uint256 messageId) = _next(
            address(gateway),
            STORY,
            3,
            receiver,
            "hello",
            r,
            a
        );
        uint256 ccipBalance = address(ccipReporter).balance;

        vm.expectEmit(address(yaho));
        emit IYaho.MessageDispatched(messageId, message);
        (uint256 id, bytes32[] memory receipts) = gateway.dispatch(STORY, 3, receiver, "hello", r, a);

        assertEq(id, messageId, "gateway id != Yaho id");
        assertEq(receipts.length, reporters.length);
        assertEq(yaho.currentNonce(), message.nonce + 1);
        assertFalse(gateway.isDispatching(messageHash), "vouch not cleared");
        // Every reporter paid its bridge.
        assertEq(ccipRouter.sends(), 1);
        assertEq(address(ccipReporter).balance, ccipBalance - ccipRouter.fee());
        assertEq(lzEndpoint.sends(), 1);
        assertEq(deBridgeGate.lastDstChainId(), STORY_DEBRIDGE_ID);
        assertEq(axelarGateway.calls(), 1);
        assertEq(veaInbox.count(), 1);
    }

    function test_GatewayRefusesNestedDispatch() public {
        ReentrantReporter reentrant = new ReentrantReporter(gateway);
        IHashiReporter[] memory r = new IHashiReporter[](1);
        IHashiAdapter[] memory a = new IHashiAdapter[](1);
        r[0] = IHashiReporter(address(reentrant));
        a[0] = IHashiAdapter(address(0xADA));
        vm.expectRevert(VouchedDispatcher.NestedDispatch.selector);
        gateway.dispatch(STORY, 1, receiver, "outer", r, a);
    }

    function test_GatewayRevertsWhenYahoReturnsAnotherId() public {
        WrongIdYaho wrongYaho = new WrongIdYaho();
        GatewayHarness wrongGateway = new GatewayHarness(address(wrongYaho));
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(0);
        Message memory message = Message(0, STORY, 1, address(wrongGateway), receiver, "m", r, a);
        uint256 expectedId = wrongYaho.calculateMessageId(
            block.chainid,
            address(wrongYaho),
            wrongYaho.calculateMessageHash(message)
        );
        vm.expectRevert(abi.encodeWithSelector(VouchedDispatcher.UnexpectedMessageId.selector, 1, expectedId));
        wrongGateway.dispatch(STORY, 1, receiver, "m", r, a);
    }

    function test_IsDispatchingIsFalseOutsideADispatch() public view {
        assertFalse(gateway.isDispatching(bytes32(0)));
        assertFalse(gateway.isDispatching(keccak256("any")));
    }

    // ---------- the reporter's checks (PRD 1.3) ----------

    function test_VouchedHashPairedWithAnotherIdReverts() public {
        MockVoucher voucher = new MockVoucher();
        bytes32 messageHash = keccak256("vouched");
        voucher.setVouched(messageHash);
        uint256 rightId = yaho.calculateMessageId(block.chainid, address(yaho), messageHash);
        uint256 wrongId = yaho.calculateMessageId(block.chainid, address(yaho), keccak256("other"));

        for (uint256 i = 0; i < reporters.length; i++) {
            vm.prank(governor);
            reporters[i].setDispatcher(address(voucher));
            uint256[] memory ids = new uint256[](1);
            bytes32[] memory hashes = new bytes32[](1);
            hashes[0] = messageHash;

            ids[0] = wrongId;
            vm.prank(address(yaho));
            vm.expectRevert(abi.encodeWithSelector(IReporter.MessageIdMismatch.selector, wrongId, rightId));
            reporters[i].dispatchMessages(STORY, IAdapter(adapters[i]), ids, hashes);

            // Positive control: the same vouched hash with its own id goes through.
            ids[0] = rightId;
            vm.prank(address(yaho));
            reporters[i].dispatchMessages(STORY, IAdapter(adapters[i]), ids, hashes);
        }
    }

    function test_UnvouchedHashWithItsIdReverts() public {
        bytes32 messageHash = keccak256("not vouched");
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = messageHash;
        ids[0] = yaho.calculateMessageId(block.chainid, address(yaho), messageHash);
        for (uint256 i = 0; i < reporters.length; i++) {
            vm.prank(address(yaho));
            vm.expectRevert(
                abi.encodeWithSelector(IReporter.MessageNotVouched.selector, address(gateway), messageHash)
            );
            reporters[i].dispatchMessages(STORY, IAdapter(adapters[i]), ids, hashes);
        }
    }

    function test_EveryHashOfABatchMustBeVouched() public {
        MockVoucher voucher = new MockVoucher();
        bytes32 vouched = keccak256("vouched");
        bytes32 other = keccak256("other");
        voucher.setVouched(vouched);
        vm.prank(governor);
        ccipReporter.setDispatcher(address(voucher));
        uint256[] memory ids = new uint256[](2);
        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = vouched;
        hashes[1] = other;
        ids[0] = yaho.calculateMessageId(block.chainid, address(yaho), vouched);
        ids[1] = yaho.calculateMessageId(block.chainid, address(yaho), other);
        vm.prank(address(yaho));
        vm.expectRevert(abi.encodeWithSelector(IReporter.MessageNotVouched.selector, address(voucher), other));
        ccipReporter.dispatchMessages(STORY, IAdapter(adapters[0]), ids, hashes);
    }

    function test_EmptyOrUnequalArraysRevert() public {
        for (uint256 i = 0; i < reporters.length; i++) {
            vm.prank(address(yaho));
            vm.expectRevert(abi.encodeWithSelector(IReporter.InvalidMessageArrays.selector, 0, 0));
            reporters[i].dispatchMessages(STORY, IAdapter(adapters[i]), new uint256[](0), new bytes32[](0));

            vm.prank(address(yaho));
            vm.expectRevert(abi.encodeWithSelector(IReporter.InvalidMessageArrays.selector, 1, 2));
            reporters[i].dispatchMessages(STORY, IAdapter(adapters[i]), new uint256[](1), new bytes32[](2));
        }
    }

    function test_UnsetDispatcherRevertsEveryDispatch() public {
        for (uint256 i = 0; i < reporters.length; i++) {
            vm.prank(governor);
            reporters[i].setDispatcher(address(0));
            (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(i);
            vm.expectRevert(IReporter.DispatcherNotSet.selector);
            gateway.dispatch(STORY, 1, receiver, "m", r, a);
        }
    }

    function test_SetDispatcherIsGovernorOnlyAndEmits() public {
        for (uint256 i = 0; i < reporters.length; i++) {
            vm.prank(stranger);
            vm.expectRevert(Governed.GovernorOnly.selector);
            reporters[i].setDispatcher(stranger);
            vm.prank(keeper);
            vm.expectRevert(Governed.GovernorOnly.selector);
            reporters[i].setDispatcher(keeper);

            address next = makeAddr("nextGateway");
            vm.expectEmit(address(reporters[i]));
            emit IReporter.DispatcherSet(next);
            vm.prank(governor);
            reporters[i].setDispatcher(next);
            assertEq(reporters[i].dispatcher(), next);
        }
    }

    /// [O4]: a gateway switch replaces the dispatcher at once; the old gateway's dispatch reverts.
    function test_OldGatewayRevertsAfterSwitch() public {
        GatewayHarness newGateway = new GatewayHarness(address(yaho));
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(0);
        vm.prank(governor);
        ccipReporter.setDispatcher(address(newGateway));

        (, bytes32 oldHash, ) = _next(address(gateway), STORY, 1, receiver, "m", r, a);
        vm.expectRevert(abi.encodeWithSelector(IReporter.MessageNotVouched.selector, address(newGateway), oldHash));
        gateway.dispatch(STORY, 1, receiver, "m", r, a);

        newGateway.dispatch(STORY, 1, receiver, "m", r, a);
        assertEq(ccipRouter.sends(), 1);
    }

    /// [O4]: a dispatcher replaced while the bridge is called (the bridge reaching the governor) voids that dispatch.
    function test_DispatcherReplacedDuringBridgeCallReverts() public {
        DispatcherSwitchingCCIPRouter router = new DispatcherSwitchingCCIPRouter();
        CCIPReporter reporter = new CCIPReporter(address(yaho), address(router), address(router), keeper);
        vm.startPrank(address(router));
        reporter.setChainSelectorByChainId(STORY, STORY_CCIP_SELECTOR);
        reporter.setDispatcher(address(gateway));
        vm.stopPrank();
        vm.deal(address(reporter), 1 ether);

        IHashiReporter[] memory r = new IHashiReporter[](1);
        IHashiAdapter[] memory a = new IHashiAdapter[](1);
        r[0] = IHashiReporter(address(reporter));
        a[0] = IHashiAdapter(adapters[0]);

        // Positive control: the same dispatch goes through while the dispatcher stays.
        gateway.dispatch(STORY, 1, receiver, "m", r, a);

        address next = makeAddr("nextGateway");
        router.arm(address(reporter), next);
        vm.expectRevert(abi.encodeWithSelector(IReporter.DispatcherReplaced.selector, address(gateway), next));
        gateway.dispatch(STORY, 1, receiver, "m", r, a);
        assertEq(reporter.dispatcher(), address(gateway), "replacement not rolled back");
    }

    /// Reporters are non-payable: a call with value is refused even from Yaho.
    function test_DispatchMessagesIsNonPayable() public {
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        vm.deal(address(yaho), 1 ether);
        vm.prank(address(yaho));
        (bool success, bytes memory ret) = address(ccipReporter).call{value: 1}(
            abi.encodeCall(IReporter.dispatchMessages, (STORY, IAdapter(adapters[0]), ids, hashes))
        );
        assertFalse(success);
        assertEq(ret.length, 0);
    }

    // ---------- PRD 1.1: dispatchBlocks and HEADER_STORAGE are gone ----------

    function test_DispatchBlocksAndHeaderStorageAreGone() public {
        for (uint256 i = 0; i < reporters.length; i++) {
            (bool success, bytes memory ret) = address(reporters[i]).call(
                abi.encodeWithSignature(
                    "dispatchBlocks(uint256,address,uint256[])",
                    STORY,
                    adapters[i],
                    new uint256[](1)
                )
            );
            assertFalse(success, "dispatchBlocks exists");
            assertEq(ret.length, 0);
            (success, ret) = address(reporters[i]).call(abi.encodeWithSignature("HEADER_STORAGE()"));
            assertFalse(success, "HEADER_STORAGE exists");
            assertEq(ret.length, 0);
        }
    }
}
