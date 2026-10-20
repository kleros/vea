// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IMessageLib, MessageLibType} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLib.sol";
import {ILayerZeroExecutor} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/interfaces/ILayerZeroExecutor.sol";
import {ExecutorOptions} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/libs/ExecutorOptions.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ILZEndpointViews} from "../helpers/BridgeViews.sol";
import {DestinationGas} from "../helpers/DestinationGas.sol";
import {LayerZeroConfig, ILZSendLibExecutorViews} from "../helpers/LayerZeroConfig.sol";
import {ReporterFunding} from "../helpers/ReporterFunding.sol";

struct LZReporterInputs {
    address endpoint;
    uint32 reporterEid;
    uint32 adapterEid;
    /// @dev lzReceive gas on the adapter chain (LZ_GAS_LIMIT).
    uint128 gasLimit;
    /// @dev Zero from _lzReporterEnv.
    uint256 funding;
    address sendLib;
    address executor;
    uint32 maxMessageSize;
    /// @dev The reporter's send config for the adapter eid, from layerzero.json.
    UlnConfig uln;
}

struct LZAdapterInputs {
    address endpoint;
    uint32 adapterEid;
    uint32 reporterEid;
    address receiveLib;
    /// @dev The adapter's receive config for the reporter eid, from layerzero.json.
    UlnConfig uln;
}

/// @dev The LayerZero route's env, layerzero.json and chain checks. Views only and no state reads, so Preflight can
/// run them before the first broadcast. The Env functions read the env and layerzero.json only and call no
/// LayerZero contract.
abstract contract LZInputs is DestinationGas, ReporterFunding, LayerZeroConfig {
    /// @dev abi.encode(ids, hashes) with one id and one hash: the message size ReporterFunding._quote sends.
    uint256 private constant LZ_QUOTE_MESSAGE_SIZE = 192;
    /// @dev Stands in for the reporter, which may not exist yet (forge refuses address(this) in a script). The
    /// executor checks the sender only against its ACL, open on LayerZero's default executors.
    address private constant LZ_QUOTE_SENDER = address(0xdead);

    /// @dev The reporter side's env: endpoint, eids, gas limit, send library, executor and the send config.
    function _lzReporterEnv() internal view returns (LZReporterInputs memory inputs) {
        inputs.endpoint = vm.envOr("LZ_REPORTER_ENDPOINT", address(0));
        _requireCode("LZ_REPORTER_ENDPOINT", inputs.endpoint);
        inputs.reporterEid = _envUint32NonZero("LZ_REPORTER_EID");
        inputs.adapterEid = _envUint32NonZero("LZ_ADAPTER_EID");
        require(inputs.reporterEid != inputs.adapterEid, "LZ_REPORTER_EID and LZ_ADAPTER_EID must differ");
        inputs.gasLimit = _lzGasLimit();

        inputs.sendLib = vm.envOr("LZ_SEND_LIB", address(0));
        _requireCode("LZ_SEND_LIB", inputs.sendLib);
        inputs.executor = vm.envOr("LZ_EXECUTOR", address(0));
        _requireCode("LZ_EXECUTOR", inputs.executor);

        string memory json = _lzConfigJson();
        (, inputs.maxMessageSize) = _parseLz(json);
        inputs.uln = _buildUln(json, inputs.reporterEid, inputs.reporterEid);
    }

    /// @dev Run on the reporter chain: the env, the endpoint and its libraries, the executor and the funding. Also
    /// checks the adapter side's keys and its layerzero.json entry (no adapter-chain calls).
    function _lzReporterInputs() internal view returns (LZReporterInputs memory inputs) {
        inputs = _lzReporterEnv();
        inputs.funding = _requiredFunding("LZ_REPORTER_FUNDING");
        // _fund refuses native funding on an EndpointV2Alt (ERC20 fees); fail here, before the reporter is deployed.
        address lzFeeToken = ILZEndpointViews(inputs.endpoint).nativeToken();
        require(
            lzFeeToken == address(0) || inputs.funding == 0,
            string.concat(
                "LZ_REPORTER_FUNDING must be 0: the endpoint charges fees in ERC20 ",
                vm.toString(lzFeeToken),
                " (EndpointV2Alt); transfer that token to the reporter instead"
            )
        );
        _lzRequireLib("LZ_SEND_LIB", inputs.endpoint, inputs.sendLib, true, inputs.adapterEid);

        _envAddressRequired("LZ_ADAPTER_ENDPOINT");
        _envAddressRequired("LZ_RECEIVE_LIB");

        string memory json = _lzConfigJson();
        _requireLzRoute(json, inputs.reporterEid, inputs.adapterEid, inputs.endpoint, ADAPTER_CHAIN_ID);
        // The adapter's receive config, so a gap in its entry fails here, before the reporter is deployed.
        _buildUln(json, inputs.adapterEid, inputs.reporterEid);

        _lzRequireExecutor(inputs);
    }

    /// @dev The adapter side's env: endpoint, eids, receive library and the receive config.
    function _lzAdapterEnv() internal view returns (LZAdapterInputs memory inputs) {
        inputs.endpoint = vm.envOr("LZ_ADAPTER_ENDPOINT", address(0));
        _requireCode("LZ_ADAPTER_ENDPOINT", inputs.endpoint);
        inputs.adapterEid = _envUint32NonZero("LZ_ADAPTER_EID");
        inputs.reporterEid = _envUint32NonZero("LZ_REPORTER_EID");
        require(inputs.reporterEid != inputs.adapterEid, "LZ_REPORTER_EID and LZ_ADAPTER_EID must differ");

        inputs.receiveLib = vm.envOr("LZ_RECEIVE_LIB", address(0));
        _requireCode("LZ_RECEIVE_LIB", inputs.receiveLib);

        string memory json = _lzConfigJson();
        _parseLz(json);
        inputs.uln = _buildUln(json, inputs.adapterEid, inputs.reporterEid);
    }

    /// @dev Run on the adapter chain: the env, the endpoint and its receive library.
    function _lzAdapterInputs() internal view returns (LZAdapterInputs memory inputs) {
        inputs = _lzAdapterEnv();
        _lzRequireLib("LZ_RECEIVE_LIB", inputs.endpoint, inputs.receiveLib, false, inputs.reporterEid);
        _requireLzRoute(_lzConfigJson(), inputs.adapterEid, inputs.reporterEid, inputs.endpoint, REPORTER_CHAIN_ID);
    }

    /// @dev `lib` is a library the endpoint registered, of the right kind, and it serves `remoteEid`.
    function _lzRequireLib(string memory key, address endpoint, address lib, bool send, uint32 remoteEid) private view {
        _requireCode(key, lib);
        require(
            ILZEndpointViews(endpoint).isRegisteredLibrary(lib),
            string.concat(key, " ", vm.toString(lib), " is not a library registered on the endpoint")
        );
        MessageLibType libType = IMessageLib(lib).messageLibType();
        require(
            libType == MessageLibType.SendAndReceive ||
                (send ? libType == MessageLibType.Send : libType == MessageLibType.Receive),
            string.concat(key, " ", vm.toString(lib), send ? " is not a send library" : " is not a receive library")
        );
        require(
            IMessageLib(lib).isSupportedEid(remoteEid),
            string.concat(key, " ", vm.toString(lib), " does not serve eid ", vm.toString(remoteEid))
        );
    }

    /// @dev LZ_EXECUTOR quotes lzReceive gas to the adapter eid, as the send library asks it to on every quote. A DVN
    /// or another non-executor, or an executor that does not serve the eid, fails here. Not in _lzReporterEnv, so
    /// HandOver never runs it.
    function _lzRequireExecutor(LZReporterInputs memory inputs) private view {
        // The executor part of LayerZeroReporter's options (OptionsBuilder.addExecutorLzReceiveOption(gasLimit, 0)):
        // the send library strips the TYPE_3 header and passes [worker id][size][option type][gas] to the executor.
        bytes memory option = ExecutorOptions.encodeLzReceiveOption(inputs.gasLimit, 0);
        bytes memory executorOptions = abi.encodePacked(
            ExecutorOptions.WORKER_ID,
            uint16(option.length + 1),
            ExecutorOptions.OPTION_TYPE_LZRECEIVE,
            option
        );
        // Raw staticcalls: a try/catch would not catch return data that fails to decode.
        (bool ok, bytes memory ret) = inputs.executor.staticcall(
            abi.encodeCall(
                ILayerZeroExecutor.getFee,
                (inputs.adapterEid, LZ_QUOTE_SENDER, LZ_QUOTE_MESSAGE_SIZE, executorOptions)
            )
        );
        if (ok && ret.length == 32) return;
        address defaultExecutor;
        (bool okDefault, bytes memory config) = inputs.sendLib.staticcall(
            abi.encodeCall(ILZSendLibExecutorViews.executorConfigs, (address(0), inputs.adapterEid))
        );
        if (okDefault && config.length == 64) {
            (, uint256 word) = abi.decode(config, (uint256, uint256));
            defaultExecutor = address(uint160(word));
        }
        revert(
            string.concat(
                "LZ_EXECUTOR ",
                vm.toString(inputs.executor),
                " cannot quote lzReceive gas to eid ",
                vm.toString(inputs.adapterEid),
                ok ? " (returned " : " (revert data ",
                vm.toString(ret),
                "): it must be a LayerZero executor that serves this pathway; the send library's default executor for eid ",
                vm.toString(inputs.adapterEid),
                " is ",
                vm.toString(defaultExecutor)
            )
        );
    }
}
