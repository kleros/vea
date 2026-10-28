// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KeeperGoverned} from "../src/governance/KeeperGoverned.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";
import {CCIPReporter} from "../src/adapters/chainlink/CCIPReporter.sol";
import {LayerZeroReporter} from "../src/adapters/layerZero/LayerZeroReporter.sol";
import {DeBridgeReporter} from "../src/adapters/deBridge/DeBridgeReporter.sol";

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

    /// [F9.1]: the governor cannot set a guardrail past 100% per update or a cooldown past a year.
    function test_ChangeKeeperGuardrailsRejectsOutOfRange() public {
        uint256 maxCooldown = axelarReporter.MAX_KEEPER_COOLDOWN();
        assertEq(maxCooldown, 365 days);

        vm.startPrank(governor);
        vm.expectRevert(abi.encodeWithSelector(KeeperGoverned.InvalidKeeperGuardrails.selector, 10_001, 1 hours));
        axelarReporter.changeKeeperGuardrails(10_001, 1 hours);
        vm.expectRevert(abi.encodeWithSelector(KeeperGoverned.InvalidKeeperGuardrails.selector, 500, maxCooldown + 1));
        axelarReporter.changeKeeperGuardrails(500, maxCooldown + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeeperGoverned.InvalidKeeperGuardrails.selector,
                type(uint256).max,
                type(uint256).max
            )
        );
        axelarReporter.changeKeeperGuardrails(type(uint256).max, type(uint256).max);
        vm.stopPrank();

        assertEq(axelarReporter.keeperMaxChangeBps(), 500);
        assertEq(axelarReporter.keeperCooldown(), 1 hours);
    }

    /// [F9.1]: the bounds themselves are accepted and enforced as set.
    function test_ChangeKeeperGuardrailsAcceptsBounds() public {
        vm.prank(governor);
        axelarReporter.changeKeeperGuardrails(10_000, 365 days);
        assertEq(axelarReporter.keeperMaxChangeBps(), 10_000);
        assertEq(axelarReporter.keeperCooldown(), 365 days);

        // 100% per update: the keeper may double the value.
        vm.warp(1_000_000);
        vm.prank(keeper);
        axelarReporter.setFee(2000);
        assertEq(axelarReporter.fee(), 2000);

        // A one-year cooldown.
        vm.warp(1_000_000 + 365 days - 1);
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(KeeperGoverned.KeeperCooldownActive.selector, FEE, 1_000_000 + 365 days)
        );
        axelarReporter.setFee(1000);
        vm.warp(1_000_000 + 365 days);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(KeeperGoverned.KeeperChangeTooLarge.selector, FEE, 2000, 4001));
        axelarReporter.setFee(4001);
        vm.prank(keeper);
        axelarReporter.setFee(4000);
        assertEq(axelarReporter.fee(), 4000);
    }

    /// [F9.1]: a keeper update of a value near type(uint256).max follows the max change rule, without overflow.
    function test_MaxChangeOnHugeValue() public {
        uint256 value = type(uint256).max;
        uint256 step = value / 20; // 5%, rounded down
        vm.prank(governor);
        axelarReporter.setFee(value);

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(KeeperGoverned.KeeperChangeTooLarge.selector, FEE, value, value - step - 1)
        );
        axelarReporter.setFee(value - step - 1);

        vm.prank(keeper);
        axelarReporter.setFee(value - step);
        assertEq(axelarReporter.fee(), value - step);
    }

    /// [F9.1]: at 100% per update, the keeper may move a value near type(uint256).max anywhere off zero.
    function test_FullMaxChangeOnHugeValue() public {
        vm.startPrank(governor);
        axelarReporter.changeKeeperGuardrails(10_000, 0);
        axelarReporter.setFee(type(uint256).max);
        vm.stopPrank();

        vm.prank(keeper);
        axelarReporter.setFee(1);
        assertEq(axelarReporter.fee(), 1);
    }

    /// [F9.1]: a huge keeper-supplied value is too large a change, not an overflow.
    function test_MaxChangeOnHugeNewValue() public {
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(KeeperGoverned.KeeperChangeTooLarge.selector, FEE, 1000, type(uint256).max)
        );
        axelarReporter.setFee(type(uint256).max);
        assertEq(axelarReporter.fee(), 1000);
    }

    /// [F9.1]: the overflow-free check accepts exactly the updates that
    /// `delta * BPS_DENOMINATOR <= oldValue * keeperMaxChangeBps` accepts.
    function testFuzz_MaxChangeMatchesBpsRule(uint256 maxChangeBps, uint256 oldValue, uint256 delta, bool up) public {
        maxChangeBps = bound(maxChangeBps, 0, 10_000);
        // Bounded so that the reference products below cannot overflow; deltas cluster around the limit.
        oldValue = bound(oldValue, 1, type(uint256).max / 30_000);
        delta = bound(delta, 0, (2 * oldValue * maxChangeBps) / 10_000 + 2);
        uint256 newValue = up || delta > oldValue ? oldValue + delta : oldValue - delta;
        vm.startPrank(governor);
        axelarReporter.changeKeeperGuardrails(maxChangeBps, 0);
        axelarReporter.setFee(oldValue);
        vm.stopPrank();

        bool allowed = delta * 10_000 <= oldValue * maxChangeBps;
        if (!allowed) {
            vm.expectRevert(
                abi.encodeWithSelector(KeeperGoverned.KeeperChangeTooLarge.selector, FEE, oldValue, newValue)
            );
        }
        vm.prank(keeper);
        axelarReporter.setFee(newValue);
        assertEq(axelarReporter.fee(), allowed ? newValue : oldValue);
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

    /// @dev The guardrails of every other keeper-adjustable value, through its own setter and key: the max change,
    /// the cooldown and the off-zero rule. `read` returns the value's current setting.
    function _assertGuardrails(address target, bytes4 setter, bytes4 read, bytes32 key) internal {
        uint256 value = _read(target, read);
        assertGt(value, 0, "fixture value must be non-zero");
        uint256 step = (value * 500) / 10_000;

        // Max change: one unit past 5% reverts, exactly 5% passes.
        vm.prank(keeper);
        (bool success, bytes memory ret) = target.call(abi.encodeWithSelector(setter, value + step + 1));
        assertFalse(success, "keeper moved the value past the max change");
        assertEq(
            ret,
            abi.encodeWithSelector(KeeperGoverned.KeeperChangeTooLarge.selector, key, value, value + step + 1)
        );
        vm.prank(keeper);
        (success, ) = target.call(abi.encodeWithSelector(setter, value + step));
        assertTrue(success, "keeper update within the max change failed");
        assertEq(_read(target, read), value + step);

        // Cooldown: a second keeper update within the hour reverts.
        vm.prank(keeper);
        (success, ret) = target.call(abi.encodeWithSelector(setter, value));
        assertFalse(success, "keeper updated the value during its cooldown");
        assertEq(
            ret,
            abi.encodeWithSelector(KeeperGoverned.KeeperCooldownActive.selector, key, block.timestamp + 1 hours)
        );

        // Off zero: only the governor moves the value off zero.
        vm.prank(governor);
        (success, ) = target.call(abi.encodeWithSelector(setter, 0));
        assertTrue(success, "governor could not set zero");
        vm.warp(block.timestamp + 1 hours);
        vm.prank(keeper);
        (success, ret) = target.call(abi.encodeWithSelector(setter, 1));
        assertFalse(success, "keeper moved the value off zero");
        assertEq(ret, abi.encodeWithSelector(KeeperGoverned.KeeperCannotMoveOffZero.selector, key));
    }

    function _read(address target, bytes4 read) internal view returns (uint256) {
        (bool success, bytes memory ret) = target.staticcall(abi.encodeWithSelector(read));
        assertTrue(success, "getter failed");
        return abi.decode(ret, (uint256));
    }

    function test_DeBridgeFeeGuardrails() public {
        _assertGuardrails(
            address(deBridgeReporter),
            DeBridgeReporter.setFee.selector,
            deBridgeReporter.fee.selector,
            FEE
        );
    }

    function test_CCIPDefaultGasLimitGuardrails() public {
        _assertGuardrails(
            address(ccipReporter),
            CCIPReporter.setDefaultGasLimit.selector,
            ccipReporter.defaultGasLimit.selector,
            keccak256("defaultGasLimit")
        );
    }

    function test_LayerZeroGasLimitGuardrails() public {
        _assertGuardrails(
            address(lzReporter),
            LayerZeroReporter.setGasLimit.selector,
            lzReporter.gasLimit.selector,
            keccak256("gasLimit")
        );
    }
}
