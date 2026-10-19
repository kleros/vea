// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {DispatcherCheck} from "../helpers/DispatcherCheck.sol";
import {HashiInputs} from "../hashi/HashiInputs.sol";
import {VeaInputs} from "../vea/VeaInputs.sol";
import {DeBridgeInputs} from "../deBridge/DeBridgeInputs.sol";
import {AxelarInputs} from "../axelar/AxelarInputs.sol";
import {CCIPInputs} from "../ccip/CCIPInputs.sol";
import {LZInputs} from "../layerZero/LZInputs.sol";

/// @notice Checks every input of the selected bridges on one chain before deploy-route.sh broadcasts anything:
/// the same env and chain checks the deploy scripts run, plus the route file (no selected bridge recorded yet), the
/// Hashi reuse rules and, without hashi, the route's Yaho and the Yaru that serves it. It never broadcasts and never
/// writes the route file. Run `reporter()` on the reporter chain and `adapter()` on the adapter chain, with
/// ROUTE_BRIDGES set to a comma list of hashi, lz, vea, ccip, debridge, axelar.
contract Preflight is DispatcherCheck, HashiInputs, VeaInputs, DeBridgeInputs, AxelarInputs, CCIPInputs, LZInputs {
    struct PreflightBridges {
        bool hashi;
        bool lz;
        bool vea;
        bool ccip;
        bool deBridge;
        bool axelar;
    }

    function reporter() external view {
        address deployer = vm.addr(vm.envUint("DEPLOYER_KEY"));
        _requireReporterChain();
        PreflightBridges memory bridges = _preflightBridges();
        _preflightRouteFile();
        _preflightNotDeployed(bridges);

        if (bridges.lz) {
            _lzReporterInputs();
            console.log("OK lz reporter inputs");
        }
        if (bridges.vea) {
            _veaReporterInputs();
            console.log("OK vea reporter inputs");
        }
        if (bridges.ccip) {
            _ccipReporterInputs();
            console.log("OK ccip reporter inputs");
        }
        if (bridges.deBridge) {
            _deBridgeReporterInputs();
            console.log("OK debridge reporter inputs");
        }
        if (bridges.axelar) {
            _axelarReporterInputs();
            console.log("OK axelar reporter inputs");
        }

        _resolveKeeper(deployer);

        // The Yaho the reporters will accept: the existing one, or none yet when --hashi deploys it.
        address yaho = _tryResolveYaho();
        if (bridges.hashi) {
            if (_hashiForceNew()) {
                console.log("OK hashi: FORCE_NEW_HASHI deploys a new Yaho");
                yaho = address(0);
            } else if (yaho != address(0)) {
                _requireCode("Yaho", yaho);
                console.log("OK hashi: reusing Yaho", yaho);
            } else {
                console.log("OK hashi: a new Yaho will be deployed");
            }
        } else {
            require(yaho != address(0), "no Yaho: add --hashi, or set YAHO_ADDRESS to the route's Yaho");
            _requireCode("Yaho", yaho);
            console.log("OK Yaho", yaho);
        }

        address dispatcher = vm.envOr("DISPATCHER_ADDRESS", address(0));
        if (dispatcher == address(0)) {
            console.log("no DISPATCHER_ADDRESS: set the dispatcher later with deploy-route.sh --set-dispatcher");
        } else {
            // A gateway dispatches through an existing Yaho, so one set before --hashi deploys it is stale.
            require(
                yaho != address(0),
                "DISPATCHER_ADDRESS is set but --hashi deploys a new Yaho: leave it empty and run deploy-route.sh --set-dispatcher once the gateway exists"
            );
            _checkDispatcher(dispatcher, yaho);
            console.log("OK DISPATCHER_ADDRESS", dispatcher);
        }
    }

    function adapter() external view {
        _requireAdapterChain();
        PreflightBridges memory bridges = _preflightBridges();
        _preflightRouteFile();
        _preflightNotDeployed(bridges);

        if (bridges.lz) {
            _lzAdapterInputs();
            console.log("OK lz adapter inputs");
        }
        if (bridges.vea) {
            _veaAdapterInputs();
            console.log("OK vea adapter inputs");
        }
        if (bridges.ccip) {
            _ccipAdapterInputs();
            console.log("OK ccip adapter inputs");
        }
        if (bridges.deBridge) {
            _deBridgeAdapterInputs();
            console.log("OK debridge adapter inputs");
        }
        if (bridges.axelar) {
            _axelarAdapterInputs();
            console.log("OK axelar adapter inputs");
        }

        if (bridges.hashi) {
            bool force = _hashiForceNew();
            address yaho = _tryResolveYaho();
            address yaru = _tryResolveYaru();
            if (force) {
                console.log("OK hashi: FORCE_NEW_HASHI deploys a new Hashi and Yaru");
            } else if (yaru == address(0)) {
                console.log("OK hashi: a new Hashi and Yaru will be deployed");
            } else {
                // DeployYaru reuses this Yaru only for the route's Yaho; a Yaho deployed in this run is a new one.
                require(
                    yaho != address(0),
                    string.concat(
                        "a Yaru exists (",
                        vm.toString(yaru),
                        ") but no Yaho: set YAHO_ADDRESS to the Yaho it serves, or FORCE_NEW_HASHI=true for a new pair"
                    )
                );
                (address reused, ) = _hashiReusedYaru(force, yaho);
                console.log("OK hashi: reusing Yaru", reused);
            }
        } else {
            // The new reporters bind to the route's Yaho, so the route's Yaru must serve it (a FORCE_NEW_HASHI run
            // whose DeployYaru failed leaves a new .yaho next to the old .yaru).
            address yaho = _tryResolveYaho();
            address yaru = _tryResolveYaru();
            require(yaho != address(0), "no Yaho: add --hashi, or set YAHO_ADDRESS to the route's Yaho");
            require(yaru != address(0), "no Yaru: add --hashi, or set YARU_ADDRESS to the route's Yaru");
            _hashiCheckYaru(yaru, yaho);
            console.log("OK Yaru", yaru);
        }
    }

    /// @dev ROUTE_BRIDGES as flags. An unknown or empty name reverts, so a typo never skips a bridge's checks.
    function _preflightBridges() private view returns (PreflightBridges memory bridges) {
        string[] memory names = vm.split(_envStringRequired("ROUTE_BRIDGES"), ",");
        for (uint256 i = 0; i < names.length; i++) {
            bytes32 name = keccak256(bytes(vm.trim(names[i])));
            if (name == keccak256("hashi")) bridges.hashi = true;
            else if (name == keccak256("lz")) bridges.lz = true;
            else if (name == keccak256("vea")) bridges.vea = true;
            else if (name == keccak256("ccip")) bridges.ccip = true;
            else if (name == keccak256("debridge")) bridges.deBridge = true;
            else if (name == keccak256("axelar")) bridges.axelar = true;
            else {
                revert(
                    string.concat(
                        "ROUTE_BRIDGES: unknown bridge '",
                        names[i],
                        "' (expected hashi, lz, vea, ccip, debridge, axelar)"
                    )
                );
            }
        }
        console.log("Preflight for", vm.envString("ROUTE_BRIDGES"), "on chain", block.chainid);
    }

    /// @dev Every selected bridge's reporter and adapter already in the route file, named in one revert. The route file
    /// is local, so each side lists both sides' contracts.
    function _preflightNotDeployed(PreflightBridges memory b) private view {
        string memory found;
        found = _preflightRecorded(found, b.lz, "lzReporter", "lzAdapter");
        found = _preflightRecorded(found, b.vea, "veaReporter", "veaAdapter");
        found = _preflightRecorded(found, b.ccip, "ccipReporter", "ccipAdapter");
        found = _preflightRecorded(found, b.deBridge, "deBridgeReporter", "deBridgeAdapter");
        found = _preflightRecorded(found, b.axelar, "axelarReporter", "axelarAdapter");
        if (bytes(found).length == 0) return;
        revert(
            string.concat(
                "the selected bridges already have contracts in ",
                _statePath(),
                ":",
                found,
                "\nIf every step of these bridges finished, drop their flags (all done: deploy the gateway, then",
                " --set-dispatcher); finish a half-done bridge with the README per-step commands from the step that",
                " failed; or archive the route file to deploy them again"
            )
        );
    }

    function _preflightRecorded(
        string memory found,
        bool selected,
        string memory reporterKey,
        string memory adapterKey
    ) private view returns (string memory) {
        if (!selected) return found;
        address r = _stateAddressOrZero(string.concat(".", reporterKey));
        address a = _stateAddressOrZero(string.concat(".", adapterKey));
        if (r != address(0)) found = string.concat(found, "\n  ", reporterKey, " ", vm.toString(r));
        if (a != address(0)) found = string.concat(found, "\n  ", adapterKey, " ", vm.toString(a));
        return found;
    }

    /// @dev Reverts on a route file the scripts would refuse (pre-#529 or another stateVersion).
    function _preflightRouteFile() private view {
        (bool exists, ) = _stateJson();
        if (exists) console.log("OK route file", _statePath());
        else console.log("no route file yet:", _statePath());
    }
}
