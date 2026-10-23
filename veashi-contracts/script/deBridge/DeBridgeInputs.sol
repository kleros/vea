// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {IDeBridgeGateViews} from "../helpers/BridgeViews.sol";
import {ReporterFunding} from "../helpers/ReporterFunding.sol";

/// @dev Reads and checks the deBridge env against the gates. deBridge addresses chains by its own ids, usually the
/// EVM id but not always (Story 1514 is 100000013), so both ids are required and each gate confirms its own. The Env
/// functions read only the keys HandOver compares and call no gate.
abstract contract DeBridgeInputs is ReporterFunding {
    struct DeBridgeReporterInputs {
        address gate;
        /// @dev deBridge id of the reporter chain.
        uint256 reporterDeBridgeChainId;
        /// @dev deBridge id of the adapter chain, the reporter's send target.
        uint256 adapterDeBridgeChainId;
        /// @dev Executor fee in wei paid on top of the gate's globalFixedNativeFee.
        uint256 fee;
        /// @dev Zero from _deBridgeReporterEnv.
        uint256 funding;
    }

    struct DeBridgeAdapterInputs {
        address gate;
        uint256 reporterDeBridgeChainId;
        uint256 adapterDeBridgeChainId;
    }

    /// @dev The reporter side's env: gate, both deBridge ids and the executor fee.
    function _deBridgeReporterEnv() internal view returns (DeBridgeReporterInputs memory inputs) {
        inputs.gate = _envAddressRequired("DEBRIDGE_REPORTER_GATE_ADDRESS");
        _requireCode("DEBRIDGE_REPORTER_GATE_ADDRESS", inputs.gate);
        (inputs.reporterDeBridgeChainId, inputs.adapterDeBridgeChainId) = _deBridgeChainIds();

        inputs.fee = _envUintRequired("DEBRIDGE_REPORTER_FEE");
        if (inputs.fee == 0) {
            require(
                _envFlag("ALLOW_ZERO_FEE"),
                "DEBRIDGE_REPORTER_FEE is 0: set the executor fee in wei, or ALLOW_ZERO_FEE=true to deploy without one"
            );
            console.log(
                "WARNING: DEBRIDGE_REPORTER_FEE is 0: no executor incentive, and the keeper can never move it off 0"
            );
        }
    }

    /// @dev Reporter chain checks: the env against the gate, the funding, plus the syntax of the adapter side's env so
    /// a preflight here catches it.
    function _deBridgeReporterInputs() internal view returns (DeBridgeReporterInputs memory inputs) {
        inputs = _deBridgeReporterEnv();
        IDeBridgeGateViews gate = IDeBridgeGateViews(inputs.gate);
        _deBridgeRequireGateChain(gate, "DEBRIDGE_REPORTER_CHAIN_ID", inputs.reporterDeBridgeChainId);

        IDeBridgeGateViews.ChainSupportInfo memory to = gate.getChainToConfig(inputs.adapterDeBridgeChainId);
        require(
            to.isSupported,
            string.concat(
                "the reporter gate cannot send to deBridge chain ",
                vm.toString(inputs.adapterDeBridgeChainId),
                " (DEBRIDGE_ADAPTER_CHAIN_ID)"
            )
        );
        // The gate charges a per-chain fee instead of the global one when it is set; the reporter sends only the global.
        uint256 globalFee = gate.globalFixedNativeFee();
        require(
            to.fixedNativeFee == 0 || to.fixedNativeFee == globalFee,
            string.concat(
                "per-chain deBridge fee ",
                vm.toString(to.fixedNativeFee),
                " set for deBridge chain ",
                vm.toString(inputs.adapterDeBridgeChainId),
                " (global ",
                vm.toString(globalFee),
                "); the reporter quotes and pays globalFixedNativeFee only"
            )
        );

        inputs.funding = _requiredFunding("DEBRIDGE_REPORTER_FUNDING");

        _envAddressRequired("DEBRIDGE_ADAPTER_GATE_ADDRESS");
    }

    /// @dev The adapter side's env: gate and both deBridge ids.
    function _deBridgeAdapterEnv() internal view returns (DeBridgeAdapterInputs memory inputs) {
        inputs.gate = _envAddressRequired("DEBRIDGE_ADAPTER_GATE_ADDRESS");
        _requireCode("DEBRIDGE_ADAPTER_GATE_ADDRESS", inputs.gate);
        (inputs.reporterDeBridgeChainId, inputs.adapterDeBridgeChainId) = _deBridgeChainIds();
    }

    /// @dev Adapter chain checks: the env against the gate, and the gate's CallProxy.
    function _deBridgeAdapterInputs() internal view returns (DeBridgeAdapterInputs memory inputs) {
        inputs = _deBridgeAdapterEnv();
        IDeBridgeGateViews gate = IDeBridgeGateViews(inputs.gate);
        _deBridgeRequireGateChain(gate, "DEBRIDGE_ADAPTER_CHAIN_ID", inputs.adapterDeBridgeChainId);

        require(
            gate.getChainFromConfig(inputs.reporterDeBridgeChainId).isSupported,
            string.concat(
                "the adapter gate does not accept messages from deBridge chain ",
                vm.toString(inputs.reporterDeBridgeChainId),
                " (DEBRIDGE_REPORTER_CHAIN_ID)"
            )
        );
        // The adapter accepts storeHashes only from the gate's CallProxy.
        _requireCode("adapter gate callProxy", gate.callProxy());
    }

    /// @dev DEBRIDGE_REPORTER_CHAIN_ID and DEBRIDGE_ADAPTER_CHAIN_ID: required and nonzero, with no EVM id fallback.
    function _deBridgeChainIds() private view returns (uint256 reporterId, uint256 adapterId) {
        reporterId = _envUintRequired("DEBRIDGE_REPORTER_CHAIN_ID");
        adapterId = _envUintRequired("DEBRIDGE_ADAPTER_CHAIN_ID");
        require(reporterId != 0, "DEBRIDGE_REPORTER_CHAIN_ID is 0");
        require(adapterId != 0, "DEBRIDGE_ADAPTER_CHAIN_ID is 0");
        require(reporterId != adapterId, "DEBRIDGE_REPORTER_CHAIN_ID and DEBRIDGE_ADAPTER_CHAIN_ID must differ");
    }

    function _deBridgeRequireGateChain(IDeBridgeGateViews gate, string memory key, uint256 expected) private view {
        uint256 actual = gate.getChainId();
        require(
            actual == expected,
            string.concat(key, " is ", vm.toString(expected), " but the gate is deBridge chain ", vm.toString(actual))
        );
    }
}
