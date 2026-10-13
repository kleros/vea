// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {IAdapter} from "../src/interfaces/IAdapter.sol";
import {PaidReporter} from "../src/adapters/PaidReporter.sol";
import {CCIPReporter} from "../src/adapters/chainlink/CCIPReporter.sol";
import {LayerZeroReporter} from "../src/adapters/layerZero/LayerZeroReporter.sol";
import {DeBridgeReporter} from "../src/adapters/deBridge/DeBridgeReporter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";
import "./utils/Mocks.sol";

/// @notice quoteDispatch returns what dispatchMessages then pays, in the token it pays in.
contract QuoteTest is VeashiTestBase {
    address internal receiver = makeAddr("receiver");

    function setUp() public override {
        super.setUp();
        // Fees that grow with the message, so a quote built from the wrong payload would not match.
        ccipRouter.setPerByte(1 gwei);
        lzEndpoint.setPerByte(2 gwei);
    }

    function test_QuoteEqualsWhatDispatchPays() public {
        for (uint256 i = 0; i < 4; i++) {
            (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _one(i);
            (, bytes32 messageHash, uint256 messageId) = _next(address(gateway), STORY, 1, receiver, "m", r, a);
            (address token, uint256 amount) = _quote(i, messageId, messageHash);
            assertEq(token, address(0), "native");
            assertGt(amount, 0, "zero quote");

            uint256 balance = address(reporters[i]).balance;
            gateway.dispatch(STORY, 1, receiver, "m", r, a);
            assertEq(balance - address(reporters[i]).balance, amount, "paid != quoted");
        }
    }

    function test_QuoteDependsOnPayloadForMeteredBridges() public view {
        uint256[] memory ids = new uint256[](2);
        bytes32[] memory hashes = new bytes32[](2);
        (, uint256 one) = _quote(0, 1, bytes32(uint256(1)));
        (, uint256 two) = ccipReporter.quoteDispatch(STORY, IAdapter(adapters[0]), ids, hashes);
        assertGt(two, one, "ccip");
        (, one) = _quote(1, 1, bytes32(uint256(1)));
        (, two) = lzReporter.quoteDispatch(STORY, IAdapter(adapters[1]), ids, hashes);
        assertGt(two, one, "layerzero");
    }

    function test_CCIPQuoteIsInTheFeeToken() public {
        address feeToken = address(new MockERC20());
        vm.prank(governor);
        ccipReporter.setFeeToken(feeToken);
        (address token, uint256 amount) = _quote(0, 1, bytes32(uint256(1)));
        assertEq(token, feeToken);
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        ids[0] = 1;
        hashes[0] = bytes32(uint256(1));
        assertEq(amount, ccipRouter.fee() + abi.encode(ids, hashes).length * 1 gwei);
    }

    function test_LayerZeroQuoteIsInTheEndpointNativeToken() public {
        address nativeErc20 = address(new MockERC20());
        lzEndpoint.setNativeToken(nativeErc20);
        (address token, ) = _quote(1, 1, bytes32(uint256(1)));
        assertEq(token, nativeErc20);
    }

    function test_QuoteFollowsKeeperFeeChange() public {
        vm.prank(keeper);
        axelarReporter.setFee(0.0042 ether);
        (, uint256 amount) = _quote(3, 1, bytes32(uint256(1)));
        assertEq(amount, 0.0042 ether);
        vm.prank(keeper);
        deBridgeReporter.setFee(0.00315 ether);
        (, amount) = _quote(2, 1, bytes32(uint256(1)));
        assertEq(amount, 0.00315 ether + deBridgeGate.globalFixedNativeFee());
    }

    function test_QuoteForUnconfiguredChainRevertsLikeDispatch() public {
        uint256 unknown = 999;
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        vm.expectRevert(CCIPReporter.ChainSelectorNotAvailable.selector);
        ccipReporter.quoteDispatch(unknown, IAdapter(adapters[0]), ids, hashes);
        vm.expectRevert(LayerZeroReporter.EndpointIdNotAvailable.selector);
        lzReporter.quoteDispatch(unknown, IAdapter(adapters[1]), ids, hashes);
        vm.expectRevert(abi.encodeWithSelector(DeBridgeReporter.DeBridgeChainIdNotSet.selector, unknown));
        deBridgeReporter.quoteDispatch(unknown, IAdapter(adapters[2]), ids, hashes);
    }

    /// @dev Axelar's unset-name check never fires (audit P6, left as is), so its quote shares the dispatch's behaviour.
    function test_AxelarQuoteForUnconfiguredChainMatchesDispatch() public view {
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        (address token, uint256 amount) = axelarReporter.quoteDispatch(999, IAdapter(adapters[3]), ids, hashes);
        assertEq(token, address(0));
        assertEq(amount, axelarReporter.fee());
    }

    function _quote(uint256 i, uint256 messageId, bytes32 messageHash) internal view returns (address, uint256) {
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        ids[0] = messageId;
        hashes[0] = messageHash;
        return PaidReporter(payable(address(reporters[i]))).quoteDispatch(STORY, IAdapter(adapters[i]), ids, hashes);
    }
}
