// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {IMessageLibManager} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {LayerZeroReporter} from "../../src/adapters/layerZero/LayerZeroReporter.sol";
import {ILZEndpointViews} from "../helpers/BridgeViews.sol";
import {LZInputs, LZReporterInputs} from "./LZInputs.sol";

/// @dev Points the reporter at the adapter, pins the send library, sets the DVN config and funds the reporter.
/// Rerunnable: it sends only the calls whose value differs, and funding tops up to LZ_REPORTER_FUNDING.
contract ConfigureLZReporter is LZInputs {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireReporterChain();

        LZReporterInputs memory inputs = _lzReporterInputs();
        LayerZeroReporter reporter = LayerZeroReporter(payable(_loadAddress(".lzReporter")));
        address adapter = _loadAddress(".lzAdapter");
        _requireCode("lzReporter", address(reporter));
        require(
            address(reporter.LAYER_ZERO_ENDPOINT()) == inputs.endpoint,
            "lzReporter uses another endpoint than LZ_REPORTER_ENDPOINT"
        );
        bytes32 peer = bytes32(uint256(uint160(adapter)));

        ILZEndpointViews endpoint = ILZEndpointViews(inputs.endpoint);
        bool needGas = reporter.gasLimit() != inputs.gasLimit;
        bool needPeer = reporter.peers(inputs.adapterEid) != peer;
        bool needEid = reporter.endpointIds(ADAPTER_CHAIN_ID) != inputs.adapterEid;
        bool needLib = endpoint.isDefaultSendLibrary(address(reporter), inputs.adapterEid) ||
            endpoint.getSendLibrary(address(reporter), inputs.adapterEid) != inputs.sendLib;
        bool needConfig = !_lzConfigMatches(
            address(reporter),
            inputs.sendLib,
            inputs.adapterEid,
            inputs.uln,
            true,
            inputs.executor,
            inputs.maxMessageSize
        );
        if (needGas || needPeer || needEid) {
            require(reporter.governor() == deployer, "lzReporter: the deployer is not its governor");
        }
        if (needLib || needConfig) {
            require(
                endpoint.delegates(address(reporter)) == deployer,
                "lzReporter: the deployer is not its endpoint delegate"
            );
        }

        vm.startBroadcast(pk);
        if (needGas) reporter.setGasLimit(inputs.gasLimit);
        if (needPeer) reporter.setPeer(inputs.adapterEid, peer);
        if (needEid) reporter.setEndpointIdByChainId(ADAPTER_CHAIN_ID, inputs.adapterEid);
        if (needLib) _pinSendLib(inputs.endpoint, address(reporter), inputs.adapterEid, inputs.sendLib);
        if (needConfig) {
            IMessageLibManager(inputs.endpoint).setConfig(
                address(reporter),
                inputs.sendLib,
                _lzSendParams(inputs.adapterEid, inputs.executor, inputs.maxMessageSize, inputs.uln)
            );
        }
        vm.stopBroadcast();
        if (!(needGas || needPeer || needEid || needLib || needConfig)) {
            console.log("lzReporter already configured: nothing to send");
        }

        _verifyLz(
            inputs.endpoint,
            address(reporter),
            inputs.sendLib,
            inputs.adapterEid,
            inputs.uln,
            true,
            inputs.executor,
            inputs.maxMessageSize
        );
        require(reporter.gasLimit() == inputs.gasLimit, "LayerZeroReporter gasLimit mismatch");
        require(reporter.peers(inputs.adapterEid) == peer, "LayerZeroReporter peers(LZ_ADAPTER_EID) mismatch");
        require(
            reporter.endpointIds(ADAPTER_CHAIN_ID) == inputs.adapterEid,
            "LayerZeroReporter endpointIds(ADAPTER_CHAIN_ID) mismatch"
        );

        (address token, uint256 quote) = _quote(reporter, ADAPTER_CHAIN_ID, adapter, "lz");
        _fund(pk, reporter, token, quote, inputs.funding, "LZ_REPORTER_FUNDING");
    }
}
