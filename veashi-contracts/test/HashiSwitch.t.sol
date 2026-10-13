// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {Switch} from "../src/HashiSwitch.sol";
import {IReporter} from "../src/interfaces/IReporter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";

/// @notice PRD 1.5 as [O5] settles it: `turnOnLightBulb` is non-payable, otherwise unchanged.
contract HashiSwitchTest is VeashiTestBase {
    Switch internal lightSwitch;

    function setUp() public override {
        super.setUp();
        lightSwitch = new Switch(address(yaho));
    }

    function test_TurnOnLightBulbRefusesValue() public {
        IHashiReporter[] memory r = new IHashiReporter[](1);
        IHashiAdapter[] memory a = new IHashiAdapter[](1);
        a[0] = IHashiAdapter(makeAddr("adapter"));
        bytes memory callData = abi.encodeCall(Switch.turnOnLightBulb, (uint32(STORY), makeAddr("bulb"), 1, r, a));
        vm.deal(address(this), 1 ether);

        (bool success, bytes memory ret) = address(lightSwitch).call{value: 1}(callData);
        assertFalse(success, "turnOnLightBulb accepted value");
        assertEq(ret.length, 0);

        // Positive control: the same call without value dispatches (Yaho skips the zero reporter).
        (success, ) = address(lightSwitch).call(callData);
        assertTrue(success);
        assertEq(yaho.currentNonce(), 1);
    }

    /// [O5]: the Switch vouches for nothing, so a reporter whose dispatcher is the gateway refuses its message.
    function test_SwitchCannotSpendAReporterBalance() public {
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(0);
        (, bytes32 messageHash, ) = _next(
            address(lightSwitch),
            STORY,
            1,
            makeAddr("bulb"),
            abi.encode(address(this)),
            r,
            a
        );
        vm.expectRevert(abi.encodeWithSelector(IReporter.MessageNotVouched.selector, address(gateway), messageHash));
        lightSwitch.turnOnLightBulb(uint32(STORY), makeAddr("bulb"), 1, r, a);
    }
}
