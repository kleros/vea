// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {ReporterFunding} from "../helpers/ReporterFunding.sol";

/// @dev Reads and checks the Axelar route inputs before anything is broadcast.
/// Axelar chain names are its axelarIds, and both contracts compare them byte for byte, case included:
/// "Ethereum", "Polygon", "Avalanche" are capitalized while "arbitrum", "base" are not. A name in the wrong case
/// deploys and dispatches cleanly (the gateway checks nothing on chain), but Axelar never routes a message to an
/// unknown destination name, so the prepaid gas is spent, and the adapter rejects every message from an unknown
/// source name. The Env functions read only the keys HandOver compares and call no Axelar contract.
abstract contract AxelarInputs is ReporterFunding {
    /// @dev Axelar's InterchainTokenService, at this address on every EVM chain that has it.
    address private constant AXELAR_ITS = 0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C;

    struct AxelarReporterInputs {
        address gateway;
        address gasService;
        /// @dev The adapter chain's axelarId, the destination the reporter sends to.
        string adapterChainName;
        uint256 fee;
        /// @dev Zero from _axelarReporterEnv.
        uint256 funding;
    }

    struct AxelarAdapterInputs {
        address gateway;
        /// @dev The reporter chain's axelarId, which Axelar delivers as the source chain.
        string reporterChainName;
    }

    /// @dev The reporter side's env: gateway, gas service, destination name and fee.
    function _axelarReporterEnv() internal view returns (AxelarReporterInputs memory inputs) {
        inputs.gateway = _envAddressRequired("AXELAR_REPORTER_GATEWAY");
        _requireCode("AXELAR_REPORTER_GATEWAY", inputs.gateway);
        inputs.gasService = _envAddressRequired("AXELAR_REPORTER_GAS_SERVICE");
        _requireCode("AXELAR_REPORTER_GAS_SERVICE", inputs.gasService);
        inputs.adapterChainName = _envStringRequired("AXELAR_ADAPTER_CHAIN_NAME");

        inputs.fee = _envUintRequired("AXELAR_REPORTER_FEE");
        if (inputs.fee == 0) {
            require(
                _envFlag("ALLOW_ZERO_FEE"),
                "AXELAR_REPORTER_FEE is 0: the reporter would prepay no Axelar gas. Set ALLOW_ZERO_FEE=true if gas is paid another way"
            );
            console.log(
                "WARNING: AXELAR_REPORTER_FEE is 0 (ALLOW_ZERO_FEE): messages stall until someone pays gas, and only the governor (not the keeper) can raise the fee off 0"
            );
        }
    }

    /// @dev Reporter-chain inputs: the env, this chain's own Axelar name and the funding, plus a syntax check of the
    /// adapter side's keys so a reporter-chain preflight catches them before the first broadcast.
    function _axelarReporterInputs() internal view returns (AxelarReporterInputs memory inputs) {
        inputs = _axelarReporterEnv();
        inputs.funding = _requiredFunding("AXELAR_REPORTER_FUNDING");

        _envAddressRequired("AXELAR_ADAPTER_GATEWAY");
        string memory reporterChainName = _envStringRequired("AXELAR_REPORTER_CHAIN_NAME");
        _requireAxelarChainName("AXELAR_REPORTER_CHAIN_NAME", reporterChainName);
        require(
            keccak256(bytes(inputs.adapterChainName)) != keccak256(bytes(reporterChainName)),
            "AXELAR_ADAPTER_CHAIN_NAME and AXELAR_REPORTER_CHAIN_NAME must differ"
        );
    }

    /// @dev The adapter side's env: gateway and source name.
    function _axelarAdapterEnv() internal view returns (AxelarAdapterInputs memory inputs) {
        inputs.gateway = _envAddressRequired("AXELAR_ADAPTER_GATEWAY");
        _requireCode("AXELAR_ADAPTER_GATEWAY", inputs.gateway);
        inputs.reporterChainName = _envStringRequired("AXELAR_REPORTER_CHAIN_NAME");
    }

    /// @dev Adapter-chain inputs: the env and this chain's own Axelar name.
    function _axelarAdapterInputs() internal view returns (AxelarAdapterInputs memory inputs) {
        inputs = _axelarAdapterEnv();
        string memory adapterChainName = _envStringRequired("AXELAR_ADAPTER_CHAIN_NAME");
        _requireAxelarChainName("AXELAR_ADAPTER_CHAIN_NAME", adapterChainName);
        require(
            keccak256(bytes(adapterChainName)) != keccak256(bytes(inputs.reporterChainName)),
            "AXELAR_ADAPTER_CHAIN_NAME and AXELAR_REPORTER_CHAIN_NAME must differ"
        );
    }

    /// @dev Requires `name` to be this chain's axelarId, which Axelar's InterchainTokenService answers in
    /// chainName(). Where ITS has no code (a local chain, or an Axelar chain without ITS) or chainName() cannot be
    /// read, it warns and skips.
    function _requireAxelarChainName(string memory key, string memory name) internal view {
        if (AXELAR_ITS.code.length == 0) {
            console.log(
                string.concat(
                    "WARNING: no Axelar ITS on chain ",
                    vm.toString(block.chainid),
                    "; cannot check ",
                    key,
                    " = ",
                    name
                )
            );
            return;
        }
        (bool ok, bytes memory ret) = AXELAR_ITS.staticcall(abi.encodeWithSignature("chainName()"));
        if (!ok || ret.length < 64) {
            console.log(
                string.concat(
                    "WARNING: ITS chainName() unreadable on chain ",
                    vm.toString(block.chainid),
                    "; cannot check ",
                    key,
                    " = ",
                    name
                )
            );
            return;
        }
        string memory live = abi.decode(ret, (string));
        require(
            keccak256(bytes(live)) == keccak256(bytes(name)),
            string.concat(
                key,
                " is '",
                name,
                "' but Axelar names chain ",
                vm.toString(block.chainid),
                " '",
                live,
                "' (case-sensitive)"
            )
        );
    }
}
