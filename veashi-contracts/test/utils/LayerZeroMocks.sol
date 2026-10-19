// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MessagingParams, MessagingFee, MessagingReceipt} from "../../src/adapters/layerZero/interfaces/ILayerZeroEndpointV2.sol";

/// @dev The ERC20 an EndpointV2Alt takes in place of native value.
contract LZAltToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Models LayerZero's EndpointV2Alt: at `send` the endpoint's whole alt-token balance is the supplied fee,
/// the quoted fee goes to the send library and the excess is refunded to `refundAddress` (as Transfer.token does).
contract LZAltEndpointMock {
    address public constant SEND_LIBRARY = address(0x5E4D);

    LZAltToken public immutable altToken;
    uint256 public fee = 0.02 ether;
    /// @dev Fee per byte of message, so a quote depends on the message (0 keeps the fee flat).
    uint256 public perByte;
    mapping(address => address) public delegates;
    uint32 public lastDstEid;
    bytes32 public lastReceiver;
    address public lastRefundAddress;
    uint256 public sends;

    error LZ_OnlyAltToken();
    error LZ_InsufficientFee(
        uint256 requiredNative,
        uint256 suppliedNative,
        uint256 requiredLzToken,
        uint256 suppliedLzToken
    );
    error Transfer_ToAddressIsZero();

    constructor(LZAltToken altToken_) {
        altToken = altToken_;
    }

    function nativeToken() external view returns (address) {
        return address(altToken);
    }

    function setDelegate(address delegate) external {
        delegates[msg.sender] = delegate;
    }

    function setPerByte(uint256 perByte_) external {
        perByte = perByte_;
    }

    function quote(MessagingParams calldata params, address) public view returns (MessagingFee memory) {
        return MessagingFee(fee + params.message.length * perByte, 0);
    }

    function send(
        MessagingParams calldata params,
        address refundAddress
    ) external payable returns (MessagingReceipt memory r) {
        if (msg.value > 0) revert LZ_OnlyAltToken();
        uint256 required = quote(params, msg.sender).nativeFee;
        uint256 supplied = altToken.balanceOf(address(this));
        if (required > supplied) revert LZ_InsufficientFee(required, supplied, 0, 0);
        _transfer(SEND_LIBRARY, required);
        if (required < supplied) _transfer(refundAddress, supplied - required);
        lastDstEid = params.dstEid;
        lastReceiver = params.receiver;
        lastRefundAddress = refundAddress;
        sends++;
        r.guid = keccak256(abi.encode(sends));
        r.nonce = uint64(sends);
        r.fee = MessagingFee(required, 0);
    }

    function _transfer(address to, uint256 amount) internal {
        if (to == address(0)) revert Transfer_ToAddressIsZero();
        altToken.transfer(to, amount);
    }
}
