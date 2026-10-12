// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {ILayerZeroEndpointV2, MessagingParams, MessagingFee, MessagingReceipt} from "./interfaces/ILayerZeroEndpointV2.sol";
import {Reporter} from "../Reporter.sol";
import {PaidReporter} from "../PaidReporter.sol";
import {GovernedOAppCore} from "./GovernedOAppCore.sol";
import {Governed} from "../../governance/Governed.sol";
import {OptionsBuilder} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";
import {OAppCore} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppCore.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LayerZeroReporter is PaidReporter, GovernedOAppCore {
    using OptionsBuilder for bytes;
    using SafeERC20 for IERC20;

    string public constant PROVIDER = "layer-zero";
    ILayerZeroEndpointV2 public immutable LAYER_ZERO_ENDPOINT;

    mapping(uint256 => uint32) public endpointIds;
    uint128 public gasLimit;
    address public refundAddress;

    error EndpointIdNotAvailable();

    event EndpointIdSet(uint256 indexed chainId, uint32 indexed endpointId);
    event GasLimitSet(uint256 gasLimit);
    event DefaultRefundAddressSet(address indexed refundAddress);

    constructor(
        address yaho,
        address lzEndpoint,
        address delegate,
        address refundAddress_,
        uint128 defaultGasLimit_,
        address governor_,
        address keeper_
    ) Reporter(yaho, governor_, keeper_) OAppCore(lzEndpoint, delegate) {
        refundAddress = refundAddress_;
        gasLimit = defaultGasLimit_;
        LAYER_ZERO_ENDPOINT = ILayerZeroEndpointV2(lzEndpoint);
    }

    function setEndpointIdByChainId(uint256 chainId, uint32 endpointId) external onlyByGovernor {
        endpointIds[chainId] = endpointId;
        emit EndpointIdSet(chainId, endpointId);
    }

    function setGasLimit(uint128 gasLimit_) external onlyByGovernorOrKeeper {
        _checkKeeperUpdate(keccak256("gasLimit"), gasLimit, gasLimit_);
        gasLimit = gasLimit_;
        emit GasLimitSet(gasLimit_);
    }

    function setDefaultRefundAddress(address refundAddress_) external onlyByGovernor {
        refundAddress = refundAddress_;
        emit DefaultRefundAddressSet(refundAddress_);
    }

    function _setGovernor(address newGovernor) internal override(Governed, GovernedOAppCore) {
        super._setGovernor(newGovernor);
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

        // Chains without a native gas token (e.g. Tempo) run LayerZero's EndpointV2Alt:
        // endpoint.nativeToken() returns an ERC20 that stands in for native value, and the
        // fee is paid by transferring that token to the endpoint rather than via msg.value.
        // On ordinary chains nativeToken() is address(0) and the native path is used.
        address nativeErc20 = LAYER_ZERO_ENDPOINT.nativeToken();

        MessagingReceipt memory receipt;
        if (nativeErc20 == address(0)) {
            receipt = LAYER_ZERO_ENDPOINT.send{value: msgFee.nativeFee}(params, refundAddress);
        } else {
            IERC20(nativeErc20).safeTransfer(address(LAYER_ZERO_ENDPOINT), msgFee.nativeFee);
            receipt = LAYER_ZERO_ENDPOINT.send(params, refundAddress);
        }
        return receipt.guid;
    }
}
