// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAdapter} from "../src/interfaces/IAdapter.sol";
import {LayerZeroAdapter} from "../src/adapters/layerZero/LayerZeroAdapter.sol";
import {Origin} from "../src/adapters/layerZero/interfaces/ILayerZeroEndpointV2.sol";
import {MockLZEndpoint} from "./utils/Mocks.sol";

/// @notice lzReceive stores hashes only when the endpoint delivers them from the eid's enabled reporter,
/// which must also be its peer, and only under the chain id mapped to that eid.
contract LZAdapterTest is Test {
    uint256 internal constant STORY = 1514;
    uint32 internal constant STORY_EID = 30340;
    uint256 internal constant ETHEREUM = 1;
    uint32 internal constant ETHEREUM_EID = 30101;

    address internal governor = makeAddr("governor");
    address internal stranger = makeAddr("stranger");
    address internal reporter = makeAddr("lzReporter");
    address internal executor = makeAddr("executor");
    MockLZEndpoint internal endpoint;
    LayerZeroAdapter internal adapter;

    uint256[] internal ids;
    bytes32[] internal hashes;

    function setUp() public {
        endpoint = new MockLZEndpoint();
        adapter = new LayerZeroAdapter(address(endpoint), governor, governor);
        vm.startPrank(governor);
        adapter.setReporterByChain(STORY, STORY_EID, reporter);
        adapter.setPeer(STORY_EID, _bytes32(reporter));
        vm.stopPrank();
        ids.push(11);
        ids.push(12);
        hashes.push(keccak256("first"));
        hashes.push(keccak256("second"));
    }

    function test_StoresHashesUnderTheMappedChainId() public {
        for (uint256 i = 0; i < ids.length; i++) {
            vm.expectEmit(address(adapter));
            emit IAdapter.HashStored(ids[i], hashes[i]);
        }
        _receive(address(endpoint), STORY_EID, _bytes32(reporter));
        for (uint256 i = 0; i < ids.length; i++) {
            assertEq(adapter.getHash(STORY, ids[i]), hashes[i]);
            assertEq(adapter.getHash(0, ids[i]), bytes32(0));
        }
    }

    function test_RejectsCallersOtherThanTheEndpoint() public {
        _assertRejected(stranger, STORY_EID, _bytes32(reporter));
        _assertRejected(reporter, STORY_EID, _bytes32(reporter));
    }

    function test_RejectsAWrongSender() public {
        _assertRejected(address(endpoint), STORY_EID, _bytes32(stranger));
        // Matches the reporter only in its low 160 bits.
        _assertRejected(address(endpoint), STORY_EID, _bytes32(reporter) | bytes32(uint256(1) << 160));
    }

    function test_RejectsAnEidWithNoReporter() public {
        _assertRejected(address(endpoint), ETHEREUM_EID, _bytes32(reporter));
        _assertRejected(address(endpoint), ETHEREUM_EID, bytes32(0));

        // Mapped to a chain and peered, but no reporter enabled.
        vm.startPrank(governor);
        adapter.setReporterByChain(ETHEREUM, ETHEREUM_EID, address(0));
        adapter.setPeer(ETHEREUM_EID, _bytes32(reporter));
        vm.stopPrank();
        _assertRejected(address(endpoint), ETHEREUM_EID, _bytes32(reporter));
    }

    /// Audit F6.1: hashes stored under chain id 0 are never read by Yaru.
    function test_RejectsAnEidMappedToChainIdZero() public {
        vm.startPrank(governor);
        adapter.setReporterByChain(0, ETHEREUM_EID, reporter);
        adapter.setPeer(ETHEREUM_EID, _bytes32(reporter));
        vm.stopPrank();
        _assertRejected(address(endpoint), ETHEREUM_EID, _bytes32(reporter));

        // Positive control: the same route mapped to a chain is accepted.
        vm.prank(governor);
        adapter.setReporterByChain(ETHEREUM, ETHEREUM_EID, reporter);
        _receive(address(endpoint), ETHEREUM_EID, _bytes32(reporter));
        assertEq(adapter.getHash(ETHEREUM, ids[0]), hashes[0]);
    }

    /// Audit F6.2: de-peering a route stops it even while its reporter stays enabled.
    function test_RejectsAfterThePeerIsRemoved() public {
        vm.prank(governor);
        adapter.setPeer(STORY_EID, bytes32(0));
        _assertRejected(address(endpoint), STORY_EID, _bytes32(reporter));
    }

    /// Audit F6.2: repointing the peer stops the old reporter; the new one needs to be enabled too.
    function test_RejectsWhenThePeerPointsElsewhere() public {
        address nextReporter = makeAddr("nextReporter");
        vm.prank(governor);
        adapter.setPeer(STORY_EID, _bytes32(nextReporter));
        _assertRejected(address(endpoint), STORY_EID, _bytes32(reporter));
        _assertRejected(address(endpoint), STORY_EID, _bytes32(nextReporter));

        // Positive control: once enabled as well, the new peer is accepted.
        vm.prank(governor);
        adapter.setReporterByChain(STORY, STORY_EID, nextReporter);
        _receive(address(endpoint), STORY_EID, _bytes32(nextReporter));
        assertEq(adapter.getHash(STORY, ids[0]), hashes[0]);
    }

    function _receive(address caller, uint32 srcEid, bytes32 sender) internal {
        bytes memory message = abi.encode(ids, hashes);
        vm.prank(caller);
        adapter.lzReceive(Origin(srcEid, sender, 1), keccak256("guid"), message, executor, "");
    }

    function _assertRejected(address caller, uint32 srcEid, bytes32 sender) internal {
        bytes memory message = abi.encode(ids, hashes);
        vm.prank(caller);
        vm.expectRevert(LayerZeroAdapter.UnauthorizedLayerZeroReceive.selector);
        adapter.lzReceive(Origin(srcEid, sender, 1), keccak256("guid"), message, executor, "");
        for (uint256 i = 0; i < ids.length; i++) {
            assertEq(adapter.getHash(0, ids[i]), bytes32(0));
            assertEq(adapter.getHash(STORY, ids[i]), bytes32(0));
            assertEq(adapter.getHash(ETHEREUM, ids[i]), bytes32(0));
        }
    }

    function _bytes32(address account) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(account)));
    }
}
