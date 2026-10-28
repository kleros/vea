// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OAppCore} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppCore.sol";
import {Governed} from "../src/governance/Governed.sol";
import {GovernedOAppCore} from "../src/adapters/layerZero/GovernedOAppCore.sol";
import {LayerZeroReporter} from "../src/adapters/layerZero/LayerZeroReporter.sol";
import {LayerZeroAdapter} from "../src/adapters/layerZero/LayerZeroAdapter.sol";
import "./utils/Mocks.sol";

/// @notice PRD 4.6: the LayerZero OZ owner stays equal to the governor; the endpoint delegate is separate.
contract LayerZeroOwnershipTest is Test {
    address internal deployer = makeAddr("deployer");
    address internal governor = makeAddr("governor");
    address internal delegate = makeAddr("delegate");
    address internal stranger = makeAddr("stranger");
    MockLZEndpoint internal endpoint;
    GovernedOAppCore[2] internal oapps;

    function setUp() public {
        endpoint = new MockLZEndpoint();
        vm.startPrank(deployer);
        oapps[0] = GovernedOAppCore(
            address(
                new LayerZeroReporter(
                    makeAddr("yaho"),
                    address(endpoint),
                    delegate,
                    delegate,
                    200_000,
                    governor,
                    governor
                )
            )
        );
        oapps[1] = GovernedOAppCore(address(new LayerZeroAdapter(address(endpoint), delegate, governor)));
        vm.stopPrank();
    }

    function test_OwnerIsGovernorAfterConstruction() public view {
        for (uint256 i = 0; i < oapps.length; i++) {
            assertEq(oapps[i].owner(), governor, "owner is not the governor");
            assertEq(oapps[i].governor(), governor);
            assertEq(endpoint.delegates(address(oapps[i])), delegate);
        }
    }

    function test_OwnerFollowsChangeGovernorAndDelegateStays() public {
        address next = makeAddr("nextGovernor");
        for (uint256 i = 0; i < oapps.length; i++) {
            vm.prank(governor);
            oapps[i].changeGovernor(next);
            assertEq(oapps[i].owner(), next, "owner did not follow the governor");
            assertEq(oapps[i].governor(), next);
            assertEq(endpoint.delegates(address(oapps[i])), delegate, "changeGovernor moved the delegate");

            // setDelegate answers to the new governor through onlyOwner.
            vm.prank(governor);
            vm.expectRevert(bytes("Ownable: caller is not the owner"));
            oapps[i].setDelegate(governor);
            vm.prank(next);
            oapps[i].setDelegate(next);
            assertEq(endpoint.delegates(address(oapps[i])), next);
        }
    }

    function test_TransferAndRenounceOwnershipRevert() public {
        for (uint256 i = 0; i < oapps.length; i++) {
            vm.prank(governor);
            vm.expectRevert(GovernedOAppCore.OwnershipFollowsGovernor.selector);
            oapps[i].transferOwnership(stranger);
            vm.prank(governor);
            vm.expectRevert(GovernedOAppCore.OwnershipFollowsGovernor.selector);
            oapps[i].renounceOwnership();
            assertEq(oapps[i].owner(), governor);
        }
    }

    function test_SetPeerIsGovernorOnly() public {
        for (uint256 i = 0; i < oapps.length; i++) {
            vm.prank(stranger);
            vm.expectRevert(Governed.GovernorOnly.selector);
            oapps[i].setPeer(1, bytes32(uint256(1)));
            vm.prank(governor);
            oapps[i].setPeer(1, bytes32(uint256(1)));
            assertEq(oapps[i].peers(1), bytes32(uint256(1)));
        }
    }

    function test_SetDelegateIsOwnerOnly() public {
        for (uint256 i = 0; i < oapps.length; i++) {
            vm.prank(stranger);
            vm.expectRevert(bytes("Ownable: caller is not the owner"));
            oapps[i].setDelegate(stranger);
        }
    }
}
