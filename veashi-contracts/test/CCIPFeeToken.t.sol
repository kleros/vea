// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {IAdapter} from "../src/interfaces/IAdapter.sol";
import {CCIPReporter} from "../src/adapters/chainlink/CCIPReporter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";
import {CCIPFeeTokenMock, CCIPFeeTokenRouterMock} from "./utils/CCIPMocks.sol";

/// @notice CCIPReporter with a fee token pays the router in that token exactly what quoteDispatch returns.
contract CCIPFeeTokenTest is VeashiTestBase {
    address internal receiver = makeAddr("receiver");
    address internal adapter = makeAddr("ccipAdapter");

    CCIPFeeTokenRouterMock internal feeRouter;
    CCIPFeeTokenMock internal feeToken;
    CCIPReporter internal reporter;

    function setUp() public override {
        super.setUp();
        feeRouter = new CCIPFeeTokenRouterMock();
        feeRouter.setPerByte(1 gwei);
        feeToken = new CCIPFeeTokenMock();
        reporter = new CCIPReporter(address(yaho), address(feeRouter), governor, keeper);
        vm.startPrank(governor);
        reporter.setChainSelectorByChainId(STORY, STORY_CCIP_SELECTOR);
        reporter.setDispatcher(address(gateway));
        reporter.setFeeToken(address(feeToken));
        vm.stopPrank();
        // Native it must not touch when a fee token is set.
        vm.deal(address(reporter), 1 ether);
    }

    function test_FeeTokenDispatchPaysTheQuoteInTheFeeToken() public {
        feeToken.mint(address(reporter), 10 ether);
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _reporter();
        (address token, uint256 amount) = _quoteNext(r, a);
        assertEq(token, address(feeToken), "quote token");
        assertGt(amount, feeRouter.tokenFee(), "quote ignores the payload");

        uint256 tokenBalance = feeToken.balanceOf(address(reporter));
        gateway.dispatch(STORY, 1, receiver, "m", r, a);

        assertEq(tokenBalance - feeToken.balanceOf(address(reporter)), amount, "paid != quoted");
        assertEq(feeToken.balanceOf(address(feeRouter)), amount);
        assertEq(feeRouter.lastFeeToken(), address(feeToken));
        assertEq(feeRouter.lastFeePaid(), amount);
        assertEq(feeRouter.sends(), 1);
        assertEq(address(reporter).balance, 1 ether, "native spent");
        // The reporter approves exactly the fee and the router pulls all of it.
        assertEq(feeToken.allowance(address(reporter), address(feeRouter)), 0, "leftover allowance");
    }

    function test_FeeTokenDispatchWithoutEnoughTokensReverts() public {
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _reporter();
        (, uint256 amount) = _quoteNext(r, a);

        // No tokens: the native balance is no fallback.
        vm.expectRevert(abi.encodeWithSelector(CCIPReporter.InsufficientFeeBalance.selector, amount, 0));
        gateway.dispatch(STORY, 1, receiver, "m", r, a);

        feeToken.mint(address(reporter), amount - 1);
        vm.expectRevert(abi.encodeWithSelector(CCIPReporter.InsufficientFeeBalance.selector, amount, amount - 1));
        gateway.dispatch(STORY, 1, receiver, "m", r, a);
        assertEq(feeRouter.sends(), 0);

        // Positive control: the exact quote is enough, and all of it is spent.
        feeToken.mint(address(reporter), 1);
        gateway.dispatch(STORY, 1, receiver, "m", r, a);
        assertEq(feeToken.balanceOf(address(reporter)), 0);
        assertEq(feeToken.balanceOf(address(feeRouter)), amount);
        assertEq(feeRouter.sends(), 1);
    }

    function test_NativeDispatchStillPaysTheQuoteInNative() public {
        vm.prank(governor);
        reporter.setFeeToken(address(0));
        feeToken.mint(address(reporter), 10 ether);
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _reporter();
        (address token, uint256 amount) = _quoteNext(r, a);
        assertEq(token, address(0), "quote token");
        assertLt(amount, feeRouter.tokenFee(), "quoted at the token price");

        gateway.dispatch(STORY, 1, receiver, "m", r, a);

        assertEq(1 ether - address(reporter).balance, amount, "paid != quoted");
        assertEq(feeRouter.lastFeeToken(), address(0));
        assertEq(feeRouter.lastFeePaid(), amount);
        assertEq(feeToken.balanceOf(address(reporter)), 10 ether, "token spent");
        assertEq(feeToken.allowance(address(reporter), address(feeRouter)), 0);
    }

    function _reporter() internal view returns (IHashiReporter[] memory r, IHashiAdapter[] memory a) {
        r = new IHashiReporter[](1);
        r[0] = IHashiReporter(address(reporter));
        a = new IHashiAdapter[](1);
        a[0] = IHashiAdapter(adapter);
    }

    /// @dev The quote for the message the gateway dispatches next.
    function _quoteNext(
        IHashiReporter[] memory r,
        IHashiAdapter[] memory a
    ) internal view returns (address token, uint256 amount) {
        (, bytes32 messageHash, uint256 messageId) = _next(address(gateway), STORY, 1, receiver, "m", r, a);
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        ids[0] = messageId;
        hashes[0] = messageHash;
        return reporter.quoteDispatch(STORY, IAdapter(adapter), ids, hashes);
    }
}
