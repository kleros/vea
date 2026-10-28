// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Client} from "@chainlink/contracts-ccip/libraries/Client.sol";
import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";

/// @notice PRD 3 (P8): CCIPReporter sends GenericExtraArgsV2 with out-of-order execution allowed.
contract CCIPExtraArgsTest is VeashiTestBase {
    function test_ExtraArgsDecodeAsGenericExtraArgsV2WithOutOfOrderExecution() public {
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(0);
        gateway.dispatch(STORY, 1, makeAddr("receiver"), "m", r, a);

        bytes memory extraArgs = ccipRouter.lastExtraArgs();
        assertEq(bytes4(extraArgs), Client.GENERIC_EXTRA_ARGS_V2_TAG, "not the V2 tag");
        Client.GenericExtraArgsV2 memory decoded = abi.decode(_stripTag(extraArgs), (Client.GenericExtraArgsV2));
        assertEq(decoded.gasLimit, ccipReporter.defaultGasLimit());
        assertEq(decoded.gasLimit, 200_000);
        assertTrue(decoded.allowOutOfOrderExecution);
        assertEq(extraArgs.length, 4 + 64);
        assertEq(ccipRouter.lastSelector(), STORY_CCIP_SELECTOR);
    }

    function test_FeeAndSetFeeAreGone() public {
        (bool success, bytes memory ret) = address(ccipReporter).call(abi.encodeWithSignature("fee()"));
        assertFalse(success);
        assertEq(ret.length, 0);
        vm.prank(governor);
        (success, ret) = address(ccipReporter).call(abi.encodeWithSignature("setFee(uint256)", 1));
        assertFalse(success);
        assertEq(ret.length, 0);
    }

    function _stripTag(bytes memory data) internal pure returns (bytes memory out) {
        out = new bytes(data.length - 4);
        for (uint256 i = 0; i < out.length; i++) {
            out[i] = data[i + 4];
        }
    }
}
