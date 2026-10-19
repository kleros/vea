// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAxelarExecutable} from "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarExecutable.sol";
import {AxelarAdapter} from "../src/adapters/axelar/AxelarAdapter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";
import {VAAxelarGatewayMock} from "./utils/AdapterAcceptanceMocks.sol";

/// @notice The Axelar adapter stores a message only when the gateway approved it, from the reporter set for a
/// chain name that maps to a non-zero chain id.
contract VAAxelarAdapterTest is VeashiTestBase {
    uint256 internal constant BASE = 8453;
    bytes32 internal constant COMMAND = keccak256("command");

    VAAxelarGatewayMock internal approvingGateway;
    AxelarAdapter internal adapter;
    string internal storyReporter;

    function setUp() public override {
        super.setUp();
        approvingGateway = new VAAxelarGatewayMock();
        adapter = new AxelarAdapter(address(approvingGateway), governor);
        storyReporter = vm.toString(makeAddr("storyAxelarReporter"));
        vm.prank(governor);
        adapter.setReporterByChain(STORY, "story", storyReporter);
    }

    function _payload(uint256 id, bytes32 hash) internal pure returns (bytes memory) {
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        ids[0] = id;
        hashes[0] = hash;
        return abi.encode(ids, hashes);
    }

    function _approve(string memory sourceChain, string memory sourceAddress, bytes memory payload) internal {
        approvingGateway.approveContractCall(COMMAND, sourceChain, sourceAddress, address(adapter), keccak256(payload));
    }

    function test_UnapprovedExecuteReverts() public {
        bytes memory payload = _payload(1, keccak256("m"));
        vm.expectRevert(IAxelarExecutable.NotApprovedByGateway.selector);
        adapter.execute(COMMAND, "story", storyReporter, payload);

        // An approval covers only its own payload.
        _approve("story", storyReporter, _payload(1, keccak256("other")));
        vm.expectRevert(IAxelarExecutable.NotApprovedByGateway.selector);
        adapter.execute(COMMAND, "story", storyReporter, payload);
        assertEq(adapter.getHash(STORY, 1), bytes32(0));

        // Positive control: once approved, the same call is stored.
        _approve("story", storyReporter, payload);
        adapter.execute(COMMAND, "story", storyReporter, payload);
        assertEq(adapter.getHash(STORY, 1), keccak256("m"));
    }

    function test_WrongSourceAddressReverts() public {
        bytes memory payload = _payload(1, keccak256("m"));
        string memory impostor = vm.toString(stranger);
        _approve("story", impostor, payload);
        vm.expectRevert(AxelarAdapter.UnauthorizedAxelarReceive.selector);
        adapter.execute(COMMAND, "story", impostor, payload);
        assertEq(adapter.getHash(STORY, 1), bytes32(0));
    }

    function test_UnknownChainReverts() public {
        bytes memory payload = _payload(1, keccak256("m"));
        _approve("ethereum", storyReporter, payload);
        vm.expectRevert(AxelarAdapter.UnauthorizedAxelarReceive.selector);
        adapter.execute(COMMAND, "ethereum", storyReporter, payload);
        assertEq(adapter.getHash(0, 1), bytes32(0));
    }

    /// A chain name with a reporter but no chain id would store under domain 0; it is rejected until mapped.
    function test_ReporterWithoutChainIdReverts() public {
        vm.prank(governor);
        adapter.setReporterByChain(0, "base", storyReporter);
        bytes memory payload = _payload(1, keccak256("m"));
        _approve("base", storyReporter, payload);
        vm.expectRevert(AxelarAdapter.UnauthorizedAxelarReceive.selector);
        adapter.execute(COMMAND, "base", storyReporter, payload);
        assertEq(adapter.getHash(0, 1), bytes32(0));

        // Positive control: once the name maps to Base's id, the same approved call is stored there.
        vm.prank(governor);
        adapter.setReporterByChain(BASE, "base", storyReporter);
        adapter.execute(COMMAND, "base", storyReporter, payload);
        assertEq(adapter.getHash(BASE, 1), keccak256("m"));
        assertEq(adapter.getHash(0, 1), bytes32(0));
    }

    function test_DeliveryStoredUnderMappedChainId() public {
        uint256[] memory ids = new uint256[](2);
        bytes32[] memory hashes = new bytes32[](2);
        ids[0] = 7;
        ids[1] = 8;
        hashes[0] = keccak256("a");
        hashes[1] = keccak256("b");
        bytes memory payload = abi.encode(ids, hashes);

        _approve("story", storyReporter, payload);
        adapter.execute(COMMAND, "story", storyReporter, payload);

        assertEq(adapter.getHash(STORY, 7), hashes[0]);
        assertEq(adapter.getHash(STORY, 8), hashes[1]);
        assertEq(adapter.getHash(0, 7), bytes32(0));
    }
}
