// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KeeperGoverned} from "../src/governance/KeeperGoverned.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";

/// @notice PRD 4.2: the keeper's cooldown, maximum change and off-zero guardrails.
contract KeeperGuardrailsTest is VeashiTestBase {
    bytes32 internal constant FEE = keccak256("fee");

    function setUp() public override {
        super.setUp();
        vm.prank(governor);
        axelarReporter.setFee(1000);
    }

    function test_InitialGuardrails() public view {
        assertEq(axelarReporter.keeperMaxChangeBps(), 500);
        assertEq(axelarReporter.keeperCooldown(), 1 hours);
    }

    /// [L2]: a value the keeper never updated has no cooldown, even at a low block.timestamp.
    function test_FirstKeeperUpdateAtLowTimestampHasNoCooldown() public {
        vm.warp(1);
        vm.prank(keeper);
        axelarReporter.setFee(1050);
        assertEq(axelarReporter.fee(), 1050);
        assertEq(axelarReporter.keeperLastUpdate(FEE), 1);
    }

    function test_Cooldown() public {
        vm.warp(1_000_000);
        vm.prank(keeper);
        axelarReporter.setFee(1050);

        vm.warp(1_000_000 + 1 hours - 1);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(KeeperGoverned.KeeperCooldownActive.selector, FEE, 1_000_000 + 1 hours));
        axelarReporter.setFee(1000);

        // The governor is not bound by the cooldown.
        vm.prank(governor);
        axelarReporter.setFee(1000);

        vm.warp(1_000_000 + 1 hours);
        vm.prank(keeper);
        axelarReporter.setFee(1050);
        assertEq(axelarReporter.fee(), 1050);
    }

    function test_CooldownIsPerValueKey() public {
        vm.prank(keeper);
        axelarReporter.setFee(1050);
        // Another value of another reporter is not on cooldown.
        vm.prank(keeper);
        deBridgeReporter.setFee(0.00315 ether);
        assertEq(deBridgeReporter.fee(), 0.00315 ether);
    }

    function test_MaxChange() public {
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(KeeperGoverned.KeeperChangeTooLarge.selector, FEE, 1000, 1051));
        axelarReporter.setFee(1051);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(KeeperGoverned.KeeperChangeTooLarge.selector, FEE, 1000, 949));
        axelarReporter.setFee(949);

        vm.prank(keeper);
        axelarReporter.setFee(950);
        assertEq(axelarReporter.fee(), 950);

        // The governor moves values freely.
        vm.prank(governor);
        axelarReporter.setFee(1_000_000);
        assertEq(axelarReporter.fee(), 1_000_000);
    }

    function test_MaxChangeFollowsGuardrails() public {
        vm.prank(governor);
        axelarReporter.changeKeeperGuardrails(1000, 0);
        vm.prank(keeper);
        axelarReporter.setFee(1100);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(KeeperGoverned.KeeperChangeTooLarge.selector, FEE, 1100, 1211));
        axelarReporter.setFee(1211);
    }

    function test_OnlyGovernorMovesOffZero() public {
        vm.prank(governor);
        axelarReporter.setFee(0);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(KeeperGoverned.KeeperCannotMoveOffZero.selector, FEE));
        axelarReporter.setFee(1);

        vm.prank(governor);
        axelarReporter.setFee(1);
        assertEq(axelarReporter.fee(), 1);
    }

    function test_ChangeKeeperGuardrailsEmits() public {
        vm.expectEmit(address(axelarReporter));
        emit KeeperGoverned.KeeperGuardrailsChanged(250, 2 hours);
        vm.prank(governor);
        axelarReporter.changeKeeperGuardrails(250, 2 hours);
    }

    function test_ChangeKeeperEmits() public {
        address next = makeAddr("nextKeeper");
        vm.expectEmit(address(axelarReporter));
        emit KeeperGoverned.KeeperChanged(keeper, next);
        vm.prank(governor);
        axelarReporter.changeKeeper(next);
        // The former keeper lost its rights.
        vm.prank(keeper);
        vm.expectRevert(KeeperGoverned.GovernorOrKeeperOnly.selector);
        axelarReporter.setFee(1050);
    }
}
