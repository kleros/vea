// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

// Script-local views of bridge contracts the repo's interfaces do not cover. Every function here is `view`:
// a call to a non-view function inside vm.startBroadcast is recorded as a transaction.

/// @dev deBridge DeBridgeGate (the functions IDeBridgeGate in src/ does not declare).
interface IDeBridgeGateViews {
    struct ChainSupportInfo {
        uint256 fixedNativeFee;
        bool isSupported;
        uint16 transferFeeBps;
    }

    function getChainId() external view returns (uint256);

    function getChainToConfig(uint256 chainId) external view returns (ChainSupportInfo memory);

    function getChainFromConfig(uint256 chainId) external view returns (ChainSupportInfo memory);

    function callProxy() external view returns (address);

    function globalFixedNativeFee() external view returns (uint256);
}

/// @dev Chainlink CCIP Router.
interface ICCIPRouterViews {
    struct OffRamp {
        uint64 sourceChainSelector;
        address offRamp;
    }

    function isChainSupported(uint64 chainSelector) external view returns (bool);

    function getOnRamp(uint64 destChainSelector) external view returns (address);

    function getOffRamps() external view returns (OffRamp[] memory);
}

/// @dev LayerZero EndpointV2 (MessagingChannel, MessageLibManager and EndpointV2 views).
interface ILZEndpointViews {
    function eid() external view returns (uint32);

    function delegates(address oapp) external view returns (address);

    function nativeToken() external view returns (address);

    function isRegisteredLibrary(address lib) external view returns (bool);

    function getSendLibrary(address sender, uint32 dstEid) external view returns (address);

    function isDefaultSendLibrary(address sender, uint32 dstEid) external view returns (bool);

    function getReceiveLibrary(address receiver, uint32 srcEid) external view returns (address lib, bool isDefault);

    function getConfig(
        address oapp,
        address lib,
        uint32 eid,
        uint32 configType
    ) external view returns (bytes memory config);
}

/// @dev LayerZero ULN 302 send and receive libraries.
interface IUlnLibViews {
    /// @dev The OApp's own config, without the defaults merged in (getConfig resolves them).
    function getAppUlnConfig(address oapp, uint32 remoteEid) external view returns (UlnConfig memory);

    function getUlnConfig(address oapp, uint32 remoteEid) external view returns (UlnConfig memory);

    function getExecutorConfig(address oapp, uint32 remoteEid) external view returns (ExecutorConfig memory);
}

/// @dev The role getters every #529 reporter and adapter has (Governed, KeeperGoverned, Reporter).
interface IGovernedViews {
    function governor() external view returns (address);

    function keeper() external view returns (address);

    function dispatcher() external view returns (address);
}
