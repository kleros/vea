// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {IAdapter} from "../src/interfaces/IAdapter.sol";
import {LayerZeroReporter} from "../src/adapters/layerZero/LayerZeroReporter.sol";
import {VeashiTestBase} from "./utils/VeashiTestBase.sol";
import {LZAltToken, LZAltEndpointMock} from "./utils/LayerZeroMocks.sol";

/// @notice On an EndpointV2Alt chain the reporter pays the quoted fee in the endpoint's ERC20,
/// and stray tokens on the endpoint go to the refund address instead of blocking the dispatch.
contract LZAltFeeTest is VeashiTestBase {
    address internal receiver = makeAddr("receiver");
    address internal refund = makeAddr("refund");

    LZAltToken internal altToken;
    LZAltEndpointMock internal altEndpoint;
    LayerZeroReporter internal altReporter;

    function setUp() public override {
        super.setUp();
        altToken = new LZAltToken();
        altEndpoint = new LZAltEndpointMock(altToken);
        // A fee that grows with the message, so a quote built from the wrong payload would not match.
        altEndpoint.setPerByte(2 gwei);
        altReporter = new LayerZeroReporter(
            address(yaho),
            address(altEndpoint),
            governor,
            refund,
            200_000,
            governor,
            keeper
        );
        vm.startPrank(governor);
        altReporter.setEndpointIdByChainId(STORY, STORY_LZ_EID);
        altReporter.setDispatcher(address(gateway));
        vm.stopPrank();
        altToken.mint(address(altReporter), 1 ether);
        vm.deal(address(altReporter), 1 ether);
    }

    function test_DispatchPaysTheQuoteInTheEndpointToken() public {
        (address token, uint256 amount) = _quote("m");
        assertEq(token, altEndpoint.nativeToken(), "not the endpoint token");
        assertEq(token, address(altToken));
        assertGt(amount, altEndpoint.fee(), "quote ignores the payload");

        uint256 tokenBalance = altToken.balanceOf(address(altReporter));
        uint256 nativeBalance = address(altReporter).balance;
        _dispatch("m");

        assertEq(tokenBalance - altToken.balanceOf(address(altReporter)), amount, "paid != quoted");
        assertEq(address(altReporter).balance, nativeBalance, "paid in native");
        assertEq(altToken.balanceOf(altEndpoint.SEND_LIBRARY()), amount);
        assertEq(altToken.balanceOf(address(altEndpoint)), 0);
        assertEq(altToken.balanceOf(refund), 0, "nothing to refund");
        assertEq(altEndpoint.sends(), 1);
        assertEq(altEndpoint.lastDstEid(), STORY_LZ_EID);
        assertEq(altEndpoint.lastReceiver(), bytes32(uint256(uint160(adapters[1]))));
        assertEq(altEndpoint.lastRefundAddress(), refund);
    }

    /// Audit F7.2: EndpointV2Alt refunds its whole surplus balance, so dust sent to it must have somewhere to go.
    function test_StrayDustIsRefundedAndDoesNotBlockTheDispatch() public {
        altToken.mint(stranger, 1);
        vm.prank(stranger);
        altToken.transfer(address(altEndpoint), 1);

        (, uint256 amount) = _quote("m");
        uint256 tokenBalance = altToken.balanceOf(address(altReporter));
        _dispatch("m");

        assertEq(tokenBalance - altToken.balanceOf(address(altReporter)), amount, "paid != quoted");
        assertEq(altToken.balanceOf(refund), 1, "dust not refunded");
        assertEq(altToken.balanceOf(altEndpoint.SEND_LIBRARY()), amount);
        assertEq(altToken.balanceOf(address(altEndpoint)), 0);
        assertEq(altEndpoint.sends(), 1);
    }

    /// Audit F7.2: a zero refund address would let one unit of dust make every send revert.
    function test_ConstructorRejectsZeroRefundAddress() public {
        vm.expectRevert(LayerZeroReporter.ZeroRefundAddress.selector);
        this.deployReporter(address(0));

        // Positive control: a non-zero refund address deploys.
        assertEq(this.deployReporter(refund).refundAddress(), refund);
    }

    /// @dev External: after an expected revert of a bare `new`, Foundry runs nothing more of the test.
    function deployReporter(address refundAddress_) external returns (LayerZeroReporter) {
        return
            new LayerZeroReporter(
                address(yaho),
                address(altEndpoint),
                governor,
                refundAddress_,
                200_000,
                governor,
                keeper
            );
    }

    /// Audit F7.2: nor can the governor set one later.
    function test_SetDefaultRefundAddressRejectsZero() public {
        vm.prank(governor);
        vm.expectRevert(LayerZeroReporter.ZeroRefundAddress.selector);
        altReporter.setDefaultRefundAddress(address(0));
        assertEq(altReporter.refundAddress(), refund);

        // Positive control: a new refund address is set and receives the next refund.
        address nextRefund = makeAddr("nextRefund");
        vm.expectEmit(address(altReporter));
        emit LayerZeroReporter.DefaultRefundAddressSet(nextRefund);
        vm.prank(governor);
        altReporter.setDefaultRefundAddress(nextRefund);
        assertEq(altReporter.refundAddress(), nextRefund);

        altToken.mint(address(altEndpoint), 1);
        _dispatch("m");
        assertEq(altToken.balanceOf(nextRefund), 1, "dust not refunded");
        assertEq(altToken.balanceOf(refund), 0);
    }

    function _route() internal view returns (IHashiReporter[] memory r, IHashiAdapter[] memory a) {
        r = new IHashiReporter[](1);
        r[0] = IHashiReporter(address(altReporter));
        a = new IHashiAdapter[](1);
        a[0] = IHashiAdapter(adapters[1]);
    }

    function _dispatch(bytes memory data) internal {
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _route();
        gateway.dispatch(STORY, 1, receiver, data, r, a);
    }

    /// @dev What the reporter quotes for the next message the gateway dispatches with `data`.
    function _quote(bytes memory data) internal view returns (address, uint256) {
        (IHashiReporter[] memory r, IHashiAdapter[] memory a) = _route();
        (, bytes32 messageHash, uint256 messageId) = _next(address(gateway), STORY, 1, receiver, data, r, a);
        uint256[] memory ids = new uint256[](1);
        bytes32[] memory hashes = new bytes32[](1);
        ids[0] = messageId;
        hashes[0] = messageHash;
        return altReporter.quoteDispatch(STORY, IAdapter(adapters[1]), ids, hashes);
    }
}
