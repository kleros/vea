// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Yaru} from "@hashi/Yaru.sol";
import {Hashi} from "@hashi/Hashi.sol";
import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {Message} from "@hashi/interfaces/IMessage.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/libraries/Client.sol";
import {CCIPAdapter} from "../src/adapters/chainlink/CCIPAdapter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";
import "./utils/Mocks.sol";

/// @notice CCIPAdapter stores a delivery only from its router, from the enabled reporter of a selector mapped to a chain.
contract CCIPAdapterTest is VeashiTestBase {
    uint64 internal constant ARBITRUM_CCIP_SELECTOR = 4_949_039_107_694_359_620;

    address internal storyRouter = makeAddr("storyRouter");
    address internal arbReporter = makeAddr("arbReporter");
    CCIPAdapter internal adapter;

    uint256[] internal ids;
    bytes32[] internal hashes;

    function setUp() public override {
        super.setUp();
        // Story side: the adapter takes reports from Arbitrum's reporter.
        adapter = new CCIPAdapter(storyRouter, governor);
        vm.prank(governor);
        adapter.setReporterByChain(ARBITRUM, ARBITRUM_CCIP_SELECTOR, arbReporter);
        ids.push(7);
        hashes.push(keccak256("hash"));
    }

    /// Arbitrum -> Story: what CCIPReporter sends is stored under domain 42161 and executed by Yaru.
    function test_DeliveryFromEnabledReporterStoredUnderMappedChainId() public {
        vm.prank(governor);
        adapter.setReporterByChain(ARBITRUM, ARBITRUM_CCIP_SELECTOR, address(ccipReporter));

        RecordingReceiver target = new RecordingReceiver();
        IHashiReporter[] memory r = new IHashiReporter[](1);
        IHashiAdapter[] memory a = new IHashiAdapter[](1);
        r[0] = IHashiReporter(address(ccipReporter));
        a[0] = IHashiAdapter(address(adapter));
        (Message memory message, bytes32 messageHash, uint256 messageId) = _next(
            address(gateway),
            STORY,
            1,
            address(target),
            "ping",
            r,
            a
        );
        gateway.dispatch(STORY, 1, address(target), "ping", r, a);

        bytes memory sent = ccipRouter.lastData();

        vm.chainId(STORY);
        vm.prank(storyRouter);
        adapter.ccipReceive(_message(ARBITRUM_CCIP_SELECTOR, address(ccipReporter), sent));

        assertEq(adapter.getHash(ARBITRUM, messageId), messageHash);
        assertEq(adapter.getHash(0, messageId), bytes32(0));
        assertEq(adapter.getHash(ARBITRUM_CCIP_SELECTOR, messageId), bytes32(0));

        Yaru yaru = new Yaru(address(new Hashi()), address(yaho), ARBITRUM);
        Message[] memory messages = new Message[](1);
        messages[0] = message;
        yaru.executeMessages(messages);
        assertEq(target.lastMessageId(), messageId);
        assertEq(target.lastSourceChainId(), ARBITRUM);
        assertEq(target.lastSender(), address(gateway));
    }

    function test_NonRouterCallerReverts() public {
        Client.Any2EVMMessage memory message = _message(ARBITRUM_CCIP_SELECTOR, arbReporter, abi.encode(ids, hashes));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CCIPReceiver.InvalidRouter.selector, stranger));
        adapter.ccipReceive(message);
        vm.prank(arbReporter);
        vm.expectRevert(abi.encodeWithSelector(CCIPReceiver.InvalidRouter.selector, arbReporter));
        adapter.ccipReceive(message);
        assertEq(adapter.getHash(ARBITRUM, ids[0]), bytes32(0));

        // Positive control: the same message from the router is stored.
        vm.prank(storyRouter);
        adapter.ccipReceive(message);
        assertEq(adapter.getHash(ARBITRUM, ids[0]), hashes[0]);
    }

    function test_WrongSourceSenderReverts() public {
        vm.prank(storyRouter);
        vm.expectRevert(CCIPAdapter.UnauthorizedCCIPReceive.selector);
        adapter.ccipReceive(_message(ARBITRUM_CCIP_SELECTOR, stranger, abi.encode(ids, hashes)));
        assertEq(adapter.getHash(ARBITRUM, ids[0]), bytes32(0));
    }

    function test_SelectorWithoutReporterReverts() public {
        uint64 unknown = 1234;
        vm.prank(storyRouter);
        vm.expectRevert(CCIPAdapter.UnauthorizedCCIPReceive.selector);
        adapter.ccipReceive(_message(unknown, arbReporter, abi.encode(ids, hashes)));
        assertEq(adapter.getHash(0, ids[0]), bytes32(0));

        // A mapped selector whose reporter is disabled turns away its former reporter.
        vm.prank(governor);
        adapter.setReporterByChain(ARBITRUM, ARBITRUM_CCIP_SELECTOR, address(0));
        vm.prank(storyRouter);
        vm.expectRevert(CCIPAdapter.UnauthorizedCCIPReceive.selector);
        adapter.ccipReceive(_message(ARBITRUM_CCIP_SELECTOR, arbReporter, abi.encode(ids, hashes)));
        assertEq(adapter.getHash(ARBITRUM, ids[0]), bytes32(0));
    }

    /// F3.1: a selector with a reporter but chain id 0 would store to domain 0, which Yaru never reads.
    function test_SelectorWithReporterButNoChainIdReverts() public {
        uint64 selector = 5678;
        vm.prank(governor);
        adapter.setReporterByChain(0, selector, arbReporter);
        vm.prank(storyRouter);
        vm.expectRevert(CCIPAdapter.UnauthorizedCCIPReceive.selector);
        adapter.ccipReceive(_message(selector, arbReporter, abi.encode(ids, hashes)));
        assertEq(adapter.getHash(0, ids[0]), bytes32(0));

        // An unset selector reads as reporter address(0): a zero sender from it is turned away too.
        vm.prank(storyRouter);
        vm.expectRevert(CCIPAdapter.UnauthorizedCCIPReceive.selector);
        adapter.ccipReceive(_message(4321, address(0), abi.encode(ids, hashes)));
        assertEq(adapter.getHash(0, ids[0]), bytes32(0));

        // Positive control: once the selector maps to a chain id, the same delivery is stored there.
        vm.prank(governor);
        adapter.setReporterByChain(ARBITRUM, selector, arbReporter);
        vm.prank(storyRouter);
        adapter.ccipReceive(_message(selector, arbReporter, abi.encode(ids, hashes)));
        assertEq(adapter.getHash(ARBITRUM, ids[0]), hashes[0]);
    }

    function _message(
        uint64 sourceChainSelector,
        address sender,
        bytes memory data
    ) internal pure returns (Client.Any2EVMMessage memory) {
        return
            Client.Any2EVMMessage({
                messageId: keccak256(abi.encode(sourceChainSelector, sender, data)),
                sourceChainSelector: sourceChainSelector,
                sender: abi.encode(sender),
                data: data,
                destTokenAmounts: new Client.EVMTokenAmount[](0)
            });
    }
}
