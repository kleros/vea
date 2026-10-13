// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Governed} from "../src/governance/Governed.sol";
import {KeeperGoverned} from "../src/governance/KeeperGoverned.sol";
import {PaidReporter} from "../src/adapters/PaidReporter.sol";
import {CCIPAdapter} from "../src/adapters/chainlink/CCIPAdapter.sol";
import {LayerZeroAdapter} from "../src/adapters/layerZero/LayerZeroAdapter.sol";
import {DeBridgeAdapter} from "../src/adapters/deBridge/DeBridgeAdapter.sol";
import {AxelarAdapter} from "../src/adapters/axelar/AxelarAdapter.sol";
import {VeaAdapter} from "../src/adapters/vea/VeaAdapter.sol";
import {DeBridgeReporter} from "../src/adapters/deBridge/DeBridgeReporter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";
import "./utils/Mocks.sol";

/// @notice PRD 4.3-4.5: one test per role row of 4.4, plus the adapters' governor-only model.
contract RolesTest is VeashiTestBase {
    CCIPAdapter internal ccipAdapter;
    LayerZeroAdapter internal lzAdapter;
    DeBridgeAdapter internal deBridgeAdapter;
    AxelarAdapter internal axelarAdapter;
    VeaAdapter internal veaAdapter;

    function setUp() public override {
        super.setUp();
        ccipAdapter = new CCIPAdapter(address(ccipRouter), governor);
        lzAdapter = new LayerZeroAdapter(address(lzEndpoint), governor, governor);
        deBridgeAdapter = new DeBridgeAdapter(address(deBridgeGate), governor);
        axelarAdapter = new AxelarAdapter(address(axelarGateway), governor);
        veaAdapter = new VeaAdapter(makeAddr("veaOutbox"), STORY, governor);
    }

    /// @dev `keeper` and `stranger` revert with `GovernorOnly()`, then the governor succeeds.
    function _assertGovernorOnly(address target, bytes memory callData) internal {
        address[2] memory others = [keeper, stranger];
        for (uint256 j = 0; j < others.length; j++) {
            vm.prank(others[j]);
            (bool success, bytes memory ret) = target.call(callData);
            assertFalse(success, "non-governor call succeeded");
            assertEq(ret, abi.encodeWithSelector(Governed.GovernorOnly.selector));
        }
        vm.prank(governor);
        (bool ok, ) = target.call(callData);
        assertTrue(ok, "governor call failed");
    }

    /// @dev `stranger` reverts with `GovernorOrKeeperOnly()`, then the governor and the keeper succeed.
    function _assertGovernorOrKeeper(address target, bytes memory governorCall, bytes memory keeperCall) internal {
        vm.prank(stranger);
        (bool success, bytes memory ret) = target.call(keeperCall);
        assertFalse(success, "stranger call succeeded");
        assertEq(ret, abi.encodeWithSelector(KeeperGoverned.GovernorOrKeeperOnly.selector));
        vm.prank(governor);
        (success, ) = target.call(governorCall);
        assertTrue(success, "governor call failed");
        vm.prank(keeper);
        (success, ) = target.call(keeperCall);
        assertTrue(success, "keeper call failed");
    }

    // ---------- Row 1: governor ----------

    function test_RowGovernor_GovernanceFunctionsOnEveryReporter() public {
        for (uint256 i = 0; i < reporters.length; i++) {
            address target = address(reporters[i]);
            _assertGovernorOnly(target, abi.encodeCall(KeeperGoverned.changeKeeper, (makeAddr("keeper2"))));
            assertEq(reporters[i].keeper(), makeAddr("keeper2"));
            _assertGovernorOnly(target, abi.encodeCall(KeeperGoverned.changeKeeperGuardrails, (100, 2 hours)));
            assertEq(reporters[i].keeperMaxChangeBps(), 100);
            assertEq(reporters[i].keeperCooldown(), 2 hours);
            _assertGovernorOnly(target, abi.encodeWithSignature("setDispatcher(address)", makeAddr("gw2")));
            assertEq(reporters[i].dispatcher(), makeAddr("gw2"));
        }
    }

    /// @dev Every reporter and adapter.
    function _governedContracts() internal view returns (address[10] memory) {
        return [
            address(ccipReporter),
            address(lzReporter),
            address(deBridgeReporter),
            address(axelarReporter),
            address(veaReporter),
            address(ccipAdapter),
            address(lzAdapter),
            address(deBridgeAdapter),
            address(axelarAdapter),
            address(veaAdapter)
        ];
    }

    function test_RowGovernor_ChangeGovernorOnEveryContract() public {
        address[10] memory targets = _governedContracts();
        address newGovernor = makeAddr("newGovernor");
        for (uint256 i = 0; i < targets.length; i++) {
            _assertGovernorOnly(targets[i], abi.encodeCall(Governed.changeGovernor, (newGovernor)));
            assertEq(Governed(targets[i]).governor(), newGovernor);
            // The old governor lost control, the new one has it.
            vm.prank(governor);
            vm.expectRevert(Governed.GovernorOnly.selector);
            Governed(targets[i]).changeGovernor(governor);
            vm.prank(newGovernor);
            Governed(targets[i]).changeGovernor(governor);
        }
    }

    /// A zero governor would lock the contract (and, on the LayerZero contracts, hand the OZ owner to address(0)).
    function test_ChangeGovernorRejectsZeroOnEveryContract() public {
        address[10] memory targets = _governedContracts();
        for (uint256 i = 0; i < targets.length; i++) {
            vm.prank(governor);
            vm.expectRevert(Governed.ZeroGovernor.selector);
            Governed(targets[i]).changeGovernor(address(0));
            assertEq(Governed(targets[i]).governor(), governor);
        }
        assertEq(lzReporter.owner(), governor);
        assertEq(lzAdapter.owner(), governor);
    }

    function test_ConstructorRejectsZeroGovernor() public {
        vm.expectRevert(Governed.ZeroGovernor.selector);
        new CCIPAdapter(address(ccipRouter), address(0));
        vm.expectRevert(Governed.ZeroGovernor.selector);
        new DeBridgeReporter(address(yaho), address(deBridgeGate), address(0), keeper);
    }

    function test_RowGovernor_ChainMapsAndIds() public {
        _assertGovernorOnly(address(ccipReporter), abi.encodeCall(ccipReporter.setChainSelectorByChainId, (10, 7)));
        assertEq(ccipReporter.chainSelectors(10), 7);
        _assertGovernorOnly(address(lzReporter), abi.encodeCall(lzReporter.setEndpointIdByChainId, (10, 30111)));
        assertEq(lzReporter.endpointIds(10), 30111);
        _assertGovernorOnly(
            address(axelarReporter),
            abi.encodeCall(axelarReporter.setChainNameByChainId, (10, "optimism"))
        );
        assertEq(axelarReporter.chainNames(10), "optimism");
        _assertGovernorOnly(
            address(deBridgeReporter),
            abi.encodeCall(deBridgeReporter.setDeBridgeChainIdByChainId, (STORY, STORY_DEBRIDGE_ID))
        );
        assertEq(deBridgeReporter.deBridgeChainIds(STORY), STORY_DEBRIDGE_ID);
        _assertGovernorOnly(
            address(deBridgeAdapter),
            abi.encodeCall(deBridgeAdapter.setChainIdByDeBridgeChainId, (STORY_DEBRIDGE_ID, STORY))
        );
        assertEq(deBridgeAdapter.chainIds(STORY_DEBRIDGE_ID), STORY);
    }

    function test_RowGovernor_FeeTokenAndRefundAddress() public {
        _assertGovernorOnly(address(ccipReporter), abi.encodeCall(ccipReporter.setFeeToken, (makeAddr("link"))));
        assertEq(ccipReporter.feeToken(), makeAddr("link"));
        _assertGovernorOnly(
            address(lzReporter),
            abi.encodeCall(lzReporter.setDefaultRefundAddress, (makeAddr("refund")))
        );
        assertEq(lzReporter.refundAddress(), makeAddr("refund"));
    }

    function test_RowGovernor_AdapterSetters() public {
        address reporter = makeAddr("reporter");
        _assertGovernorOnly(address(ccipAdapter), abi.encodeCall(ccipAdapter.setReporterByChain, (STORY, 9, reporter)));
        assertEq(ccipAdapter.enabledReporters(9), reporter);
        _assertGovernorOnly(address(lzAdapter), abi.encodeCall(lzAdapter.setReporterByChain, (STORY, 30340, reporter)));
        assertEq(lzAdapter.enabledReporters(30340), reporter);
        _assertGovernorOnly(address(lzAdapter), abi.encodeCall(lzAdapter.setPeer, (30340, bytes32(uint256(1)))));
        assertEq(lzAdapter.peers(30340), bytes32(uint256(1)));
        _assertGovernorOnly(address(lzReporter), abi.encodeCall(lzReporter.setPeer, (30340, bytes32(uint256(2)))));
        assertEq(lzReporter.peers(30340), bytes32(uint256(2)));
        _assertGovernorOnly(
            address(deBridgeAdapter),
            abi.encodeCall(deBridgeAdapter.setReporterByChainId, (STORY, reporter))
        );
        assertEq(deBridgeAdapter.enabledReporters(STORY), reporter);
        _assertGovernorOnly(
            address(axelarAdapter),
            abi.encodeCall(axelarAdapter.setReporterByChain, (STORY, "story", "0xabc"))
        );
        assertEq(axelarAdapter.chainIds(keccak256("story")), STORY);
        _assertGovernorOnly(address(veaAdapter), abi.encodeCall(veaAdapter.setReporter, (reporter)));
        assertEq(veaAdapter.REPORTER(), reporter);
    }

    // ---------- Row 2: governor, or keeper within the guardrails ----------

    function test_RowKeeper_OperatingValues() public {
        _assertGovernorOrKeeper(
            address(axelarReporter),
            abi.encodeCall(axelarReporter.setFee, (1 ether)),
            abi.encodeCall(axelarReporter.setFee, (1.05 ether))
        );
        assertEq(axelarReporter.fee(), 1.05 ether);
        assertEq(axelarReporter.keeperLastUpdate(keccak256("fee")), block.timestamp);

        _assertGovernorOrKeeper(
            address(deBridgeReporter),
            abi.encodeCall(deBridgeReporter.setFee, (1 ether)),
            abi.encodeCall(deBridgeReporter.setFee, (0.95 ether))
        );
        assertEq(deBridgeReporter.fee(), 0.95 ether);
        assertEq(deBridgeReporter.keeperLastUpdate(keccak256("fee")), block.timestamp);

        _assertGovernorOrKeeper(
            address(ccipReporter),
            abi.encodeCall(ccipReporter.setDefaultGasLimit, (300_000)),
            abi.encodeCall(ccipReporter.setDefaultGasLimit, (315_000))
        );
        assertEq(ccipReporter.defaultGasLimit(), 315_000);
        assertEq(ccipReporter.keeperLastUpdate(keccak256("defaultGasLimit")), block.timestamp);

        _assertGovernorOrKeeper(
            address(lzReporter),
            abi.encodeCall(lzReporter.setGasLimit, (300_000)),
            abi.encodeCall(lzReporter.setGasLimit, (285_000))
        );
        assertEq(lzReporter.gasLimit(), 285_000);
        assertEq(lzReporter.keeperLastUpdate(keccak256("gasLimit")), block.timestamp);
    }

    // ---------- Row 3: CCIP fee and setFee removed (also CCIPExtraArgsTest) ----------

    function test_RowRemoved_CCIPFeeAndSetFee() public {
        (bool success, ) = address(ccipReporter).call(abi.encodeWithSignature("fee()"));
        assertFalse(success);
        vm.prank(governor);
        (success, ) = address(ccipReporter).call(abi.encodeWithSignature("setFee(uint256)", 1));
        assertFalse(success);
    }

    // ---------- Row 4: governor or keeper, paid to the keeper ----------

    function test_RowWithdraw_NativeAndTokenPayTheKeeper() public {
        MockERC20 token = new MockERC20();
        for (uint256 i = 0; i < 4; i++) {
            PaidReporter reporter = PaidReporter(payable(address(reporters[i])));
            token.mint(address(reporter), 10);
            uint256 keeperBalance = keeper.balance;

            vm.prank(stranger);
            vm.expectRevert(KeeperGoverned.GovernorOrKeeperOnly.selector);
            reporter.withdrawNative(1);
            vm.prank(stranger);
            vm.expectRevert(KeeperGoverned.GovernorOrKeeperOnly.selector);
            reporter.withdrawToken(IERC20(address(token)), 1);

            vm.expectEmit(address(reporter));
            emit PaidReporter.NativeWithdrawn(keeper, 0.1 ether);
            vm.prank(governor);
            reporter.withdrawNative(0.1 ether);
            vm.prank(keeper);
            reporter.withdrawNative(0.2 ether);
            assertEq(keeper.balance, keeperBalance + 0.3 ether);
            assertEq(governor.balance, 0);

            vm.expectEmit(address(reporter));
            emit PaidReporter.TokenWithdrawn(IERC20(address(token)), keeper, 3);
            vm.prank(governor);
            reporter.withdrawToken(IERC20(address(token)), 3);
            vm.prank(keeper);
            reporter.withdrawToken(IERC20(address(token)), 4);
            assertEq(token.balanceOf(keeper), 7 * (i + 1));
            assertEq(token.balanceOf(address(reporter)), 3);
            assertEq(token.balanceOf(governor), 0);
        }
    }

    function test_RowWithdraw_KeeperNotSet() public {
        MockERC20 token = new MockERC20();
        for (uint256 i = 0; i < 4; i++) {
            PaidReporter reporter = PaidReporter(payable(address(reporters[i])));
            token.mint(address(reporter), 10);
            vm.startPrank(governor);
            reporter.changeKeeper(address(0));
            vm.expectRevert(KeeperGoverned.KeeperNotSet.selector);
            reporter.withdrawNative(1);
            vm.expectRevert(KeeperGoverned.KeeperNotSet.selector);
            reporter.withdrawToken(IERC20(address(token)), 1);
            vm.stopPrank();
        }
    }

    function test_VeaReporterHasNoWithdraw() public {
        vm.startPrank(governor);
        (bool success, ) = address(veaReporter).call(abi.encodeCall(PaidReporter.withdrawNative, (0)));
        assertFalse(success);
        (success, ) = address(veaReporter).call(abi.encodeCall(PaidReporter.withdrawToken, (IERC20(address(0)), 0)));
        assertFalse(success);
        vm.stopPrank();
    }

    // ---------- PRD 4.5: adapters have a governor and no keeper ----------

    function test_AdaptersHaveNoKeeper() public {
        address[5] memory targets = [
            address(ccipAdapter),
            address(lzAdapter),
            address(deBridgeAdapter),
            address(axelarAdapter),
            address(veaAdapter)
        ];
        for (uint256 i = 0; i < targets.length; i++) {
            assertEq(Governed(targets[i]).governor(), governor);
            vm.startPrank(governor);
            (bool success, bytes memory ret) = targets[i].call(abi.encodeCall(KeeperGoverned.changeKeeper, (keeper)));
            assertFalse(success, "adapter has changeKeeper");
            assertEq(ret.length, 0);
            (success, ret) = targets[i].call(abi.encodeWithSignature("keeper()"));
            assertFalse(success, "adapter has keeper");
            (success, ret) = targets[i].call(abi.encodeCall(KeeperGoverned.changeKeeperGuardrails, (1, 1)));
            assertFalse(success, "adapter has changeKeeperGuardrails");
            vm.stopPrank();
        }
    }
}
