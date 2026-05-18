// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ILayerZeroEndpointV2, MessagingParams, MessagingFee, MessagingReceipt} from "./interfaces/ILayerZeroEndpointV2.sol";
import {Reporter} from "../Reporter.sol";
import {OptionsBuilder} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";
import {OAppCore} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppCore.sol";

contract LayerZeroReporter is Reporter, Ownable, OAppCore {
    using OptionsBuilder for bytes;

    string public constant PROVIDER = "layer-zero";
    ILayerZeroEndpointV2 public immutable LAYER_ZERO_ENDPOINT;

    mapping(uint256 => uint32) public endpointIds;
    uint128 public gasLimit;
    address refundAddress;

    error EndpointIdNotAvailable();

    event EndpointIdSet(uint256 indexed chainId, uint32 indexed endpointId);
    event GasLimitSet(uint256 gasLimit);

    constructor(
        address headerStorage,
        address yaho,
        address lzEndpoint,
        address delegate,
        address refundAddress_,
        uint128 defaultGasLimit_
    ) Reporter(headerStorage, yaho) OAppCore(lzEndpoint, delegate) {
        refundAddress = refundAddress_;
        gasLimit = defaultGasLimit_;
        LAYER_ZERO_ENDPOINT = ILayerZeroEndpointV2(lzEndpoint);
    }

    function setEndpointIdByChainId(uint256 chainId, uint32 endpointId) external onlyOwner {
        endpointIds[chainId] = endpointId;
        emit EndpointIdSet(chainId, endpointId);
    }

    function setGasLimit(uint128 gasLimit_) external onlyOwner {
        gasLimit = gasLimit_;
        emit GasLimitSet(gasLimit_);
    }

    function setDefaultRefundAddress(address refundAddress_) external onlyOwner {
        refundAddress = refundAddress_;
    }

    function oAppVersion() public pure virtual override returns (uint64 senderVersion, uint64 receiverVersion) {
        return (1, 1);
    }
    function _dispatch(
        uint256 targetChainId,
        address adapter,
        uint256[] memory ids,
        bytes32[] memory hashes
    ) internal override returns (bytes32) {
        uint32 targetEndpointId = endpointIds[targetChainId];
        if (targetEndpointId == 0) revert EndpointIdNotAvailable();
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(gasLimit, 0);
        bytes memory message = abi.encode(ids, hashes);
        bytes32 receiverBytes32 = bytes32(uint256(uint160(adapter)));
        MessagingParams memory params = MessagingParams(
            targetEndpointId,
            receiverBytes32,
            message,
            options,
            false // receiver in lz Token
        );
        // solhint-disable-next-line check-send-result
        MessagingFee memory msgFee = LAYER_ZERO_ENDPOINT.quote(params, address(this));
        MessagingReceipt memory receipt = LAYER_ZERO_ENDPOINT.send{value: msgFee.nativeFee}(params, refundAddress);
        return receipt.guid;
    }

    receive() external payable {}
}
