// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Yaho} from "@hashi/Yaho.sol";
import {Yaru} from "@hashi/Yaru.sol";
import {Hashi} from "@hashi/Hashi.sol";
import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {Message} from "@hashi/interfaces/IMessage.sol";
import {DeBridgeReporter} from "../src/adapters/deBridge/DeBridgeReporter.sol";
import {DeBridgeAdapter} from "../src/adapters/deBridge/DeBridgeAdapter.sol";
import {Flags} from "../src/adapters/deBridge/utils/Flags.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";
import "./utils/Mocks.sol";

/// @notice PRD 2.1-2.3 (P2): the deBridge legs carry deBridge chain ids to deBridge and EVM ids to Hashi.
contract DeBridgeTest is VeashiTestBase {
    address internal receiver = makeAddr("receiver");

    /// Arbitrum (42161) -> Story (1514): the gate receives Story's deBridge id 100000013.
    function test_ArbitrumToStoryDispatchUsesDeBridgeChainId() public {
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(2);
        (, bytes32 messageHash, uint256 messageId) = _next(address(gateway), STORY, 1, receiver, "m", r, a);

        gateway.dispatch(STORY, 1, receiver, "m", r, a);

        assertEq(deBridgeGate.lastDstChainId(), STORY_DEBRIDGE_ID);
        assertEq(deBridgeGate.lastValue(), deBridgeReporter.fee() + deBridgeGate.globalFixedNativeFee());
        assertEq(deBridgeGate.lastTarget(), abi.encodePacked(adapters[2]));
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        ids[0] = messageId;
        hashes[0] = messageHash;
        assertEq(deBridgeGate.lastCalldata(), abi.encodeWithSignature("storeHashes(uint256[],bytes32[])", ids, hashes));
        uint256 flags = deBridgeGate.lastFlags();
        assertTrue(Flags.getFlag(flags, Flags.PROXY_WITH_SENDER));
        assertTrue(Flags.getFlag(flags, Flags.REVERT_IF_EXTERNAL_FAIL));
    }

    function test_UnmappedTargetReverts() public {
        vm.prank(governor);
        deBridgeReporter.setDeBridgeChainIdByChainId(STORY, 0);
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(2);
        vm.expectRevert(abi.encodeWithSelector(DeBridgeReporter.DeBridgeChainIdNotSet.selector, STORY));
        gateway.dispatch(STORY, 1, receiver, "m", r, a);
    }

    function test_FeeIsPublic() public view {
        assertEq(deBridgeReporter.fee(), 0.003 ether);
    }

    /// Story -> Arbitrum: the delivery is stored under domain 1514, readable by getHash(1514, id) and executable by Yaru.
    function test_StoryToArbitrumDeliveryStoredUnderEvmChainId() public {
        // Arbitrum side: the adapter, deployed first so the Story message can name it.
        MockDeBridgeGate arbGate = new MockDeBridgeGate();
        DeBridgeAdapter adapter = new DeBridgeAdapter(address(arbGate), governor);

        // Story side: Yaho, a gateway and a DeBridgeReporter to Arbitrum (deBridge id 42161).
        vm.chainId(STORY);
        Yaho storyYaho = new Yaho();
        GatewayHarness storyGateway = new GatewayHarness(address(storyYaho));
        MockDeBridgeGate storyGate = new MockDeBridgeGate();
        DeBridgeReporter storyReporter = new DeBridgeReporter(address(storyYaho), address(storyGate), governor, keeper);
        vm.startPrank(governor);
        storyReporter.setDeBridgeChainIdByChainId(ARBITRUM, ARBITRUM);
        storyReporter.setDispatcher(address(storyGateway));
        vm.stopPrank();
        vm.deal(address(storyReporter), 1 ether);

        RecordingReceiver target = new RecordingReceiver();
        IHashiReporter[] memory r = new IHashiReporter[](1);
        IHashiAdapter[] memory a = new IHashiAdapter[](1);
        r[0] = IHashiReporter(address(storyReporter));
        a[0] = IHashiAdapter(address(adapter));
        Message memory message = Message(0, ARBITRUM, 1, address(storyGateway), address(target), "ping", r, a);
        bytes32 messageHash = storyYaho.calculateMessageHash(message);
        (uint256 messageId, ) = storyGateway.dispatch(ARBITRUM, 1, address(target), "ping", r, a);
        assertEq(storyGate.lastDstChainId(), ARBITRUM);

        // Arbitrum side: deBridge reports the source as 100000013; the adapter maps it to 1514.
        vm.chainId(ARBITRUM);
        vm.startPrank(governor);
        adapter.setChainIdByDeBridgeChainId(STORY_DEBRIDGE_ID, STORY);
        adapter.setReporterByChainId(STORY, address(storyReporter));
        vm.stopPrank();
        MockCallProxy(arbGate.callProxy()).deliver(
            STORY_DEBRIDGE_ID,
            address(storyReporter),
            address(adapter),
            storyGate.lastCalldata()
        );

        assertEq(adapter.getHash(STORY, messageId), messageHash);
        assertEq(adapter.getHash(STORY_DEBRIDGE_ID, messageId), bytes32(0));

        Yaru yaru = new Yaru(address(new Hashi()), address(storyYaho), STORY);
        Message[] memory messages = new Message[](1);
        messages[0] = message;
        yaru.executeMessages(messages);
        assertEq(target.lastMessageId(), messageId);
        assertEq(target.lastSourceChainId(), STORY);
        assertEq(target.lastSender(), address(storyGateway));
    }

    function test_UnmappedSourceReverts() public {
        MockDeBridgeGate arbGate = new MockDeBridgeGate();
        DeBridgeAdapter adapter = new DeBridgeAdapter(address(arbGate), governor);
        address storyReporter = makeAddr("storyReporter");
        vm.prank(governor);
        adapter.setReporterByChainId(STORY, storyReporter);

        bytes memory data = abi.encodeWithSignature(
            "storeHashes(uint256[],bytes32[])",
            new uint256[](1),
            new bytes32[](1)
        );
        MockCallProxy proxy = MockCallProxy(arbGate.callProxy());
        vm.expectRevert(abi.encodeWithSelector(DeBridgeAdapter.ChainIdNotSet.selector, STORY_DEBRIDGE_ID));
        proxy.deliver(STORY_DEBRIDGE_ID, storyReporter, address(adapter), data);

        // Positive control: once mapped, the same delivery is stored.
        vm.prank(governor);
        adapter.setChainIdByDeBridgeChainId(STORY_DEBRIDGE_ID, STORY);
        proxy.deliver(STORY_DEBRIDGE_ID, storyReporter, address(adapter), data);
    }

    function test_WrongSenderAndNonProxyRevert() public {
        MockDeBridgeGate arbGate = new MockDeBridgeGate();
        DeBridgeAdapter adapter = new DeBridgeAdapter(address(arbGate), governor);
        vm.startPrank(governor);
        adapter.setChainIdByDeBridgeChainId(STORY_DEBRIDGE_ID, STORY);
        adapter.setReporterByChainId(STORY, makeAddr("storyReporter"));
        vm.stopPrank();
        bytes memory data = abi.encodeWithSignature(
            "storeHashes(uint256[],bytes32[])",
            new uint256[](1),
            new bytes32[](1)
        );
        MockCallProxy proxy = MockCallProxy(arbGate.callProxy());
        vm.expectRevert(abi.encodeWithSelector(DeBridgeAdapter.UnauthorizedSender.selector, stranger, STORY));
        proxy.deliver(STORY_DEBRIDGE_ID, stranger, address(adapter), data);

        vm.expectRevert(DeBridgeAdapter.NotProxy.selector);
        adapter.storeHashes(new uint256[](1), new bytes32[](1));
    }
}
