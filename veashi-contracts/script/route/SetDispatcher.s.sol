// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {Reporter} from "../../src/adapters/Reporter.sol";
import {DispatcherCheck} from "../helpers/DispatcherCheck.sol";

/// @notice Points every reporter of the route at DISPATCHER_ADDRESS, the gateway whose vouched messages they pay to
/// dispatch. Runs on the reporter chain after the gateway exists; never writes the route file. `check()` proves the
/// result without a transaction.
contract SetDispatcher is DispatcherCheck {
    enum DispatcherStatus {
        MISSING, // not in the route file
        LEGACY, // no dispatcher() or governor(): not a PR #529 reporter
        ALREADY, // already points at DISPATCHER_ADDRESS
        FOREIGN, // governed by someone other than the deployer: the governor must call setDispatcher
        REPLACE, // governed by the deployer, points at another dispatcher: replaced only with REPLACE_DISPATCHER=true
        TODO // governed by the deployer, no dispatcher yet
    }

    struct DispatcherEntry {
        string key;
        address reporter;
        DispatcherStatus status;
        address current;
    }

    string[5] private REPORTER_KEYS = [
        "ccipReporter",
        "deBridgeReporter",
        "lzReporter",
        "axelarReporter",
        "veaReporter"
    ];

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        // A DEPLOYER_ADDRESS that is not this key's address reverts here, before any broadcast, not in the closing
        // check().
        _checkDeployer();
        address deployer = vm.addr(pk);
        (address target, address yaho) = _dispatcherSetup();
        bool replace = _envFlag("REPLACE_DISPATCHER");

        // Every check runs before the broadcast: a refusal leaves every reporter as it was.
        DispatcherEntry[] memory entries = new DispatcherEntry[](REPORTER_KEYS.length);
        string memory refused;
        for (uint256 i = 0; i < entries.length; i++) {
            DispatcherEntry memory entry = _dispatcherClassify(REPORTER_KEYS[i], deployer, target, yaho);
            entries[i] = entry;
            // Another dispatcher is refused without REPLACE_DISPATCHER, whoever governs the reporter.
            bool other = entry.status == DispatcherStatus.REPLACE || entry.status == DispatcherStatus.FOREIGN;
            if (other && entry.current != address(0) && !replace) {
                refused = string.concat(
                    refused,
                    "\n  ",
                    entry.key,
                    " ",
                    vm.toString(entry.reporter),
                    " points at dispatcher ",
                    vm.toString(entry.current)
                );
            }
        }
        require(
            bytes(refused).length == 0,
            string.concat(
                "reporters with another dispatcher (rerun with REPLACE_DISPATCHER=true to replace it; a dispatch in flight through the old one reverts):",
                refused
            )
        );

        bool send;
        for (uint256 i = 0; i < entries.length; i++) {
            DispatcherEntry memory entry = entries[i];
            if (entry.status == DispatcherStatus.REPLACE) {
                console.log("WARNING: replacing the dispatcher of", entry.key);
                console.log("  old -> new:", entry.current, target);
                console.log("  a dispatch in flight through the old dispatcher reverts DispatcherReplaced");
            }
            if (entry.status == DispatcherStatus.FOREIGN) _dispatcherGovernorAction(entry, target);
            if (entry.status == DispatcherStatus.TODO || entry.status == DispatcherStatus.REPLACE) send = true;
        }

        if (send) {
            vm.startBroadcast(pk);
            for (uint256 i = 0; i < entries.length; i++) {
                DispatcherStatus status = entries[i].status;
                if (status == DispatcherStatus.TODO || status == DispatcherStatus.REPLACE) {
                    Reporter(entries[i].reporter).setDispatcher(target);
                }
            }
            vm.stopBroadcast();
        }

        console.log("SetDispatcher summary, chain", block.chainid, "dispatcher", target);
        for (uint256 i = 0; i < entries.length; i++) {
            DispatcherEntry memory entry = entries[i];
            if (entry.status == DispatcherStatus.TODO || entry.status == DispatcherStatus.REPLACE) {
                require(
                    Reporter(entry.reporter).dispatcher() == target,
                    string.concat(entry.key, " dispatcher read-back mismatch")
                );
            }
            _dispatcherLog(entry, _dispatcherLabel(entry.status, true));
        }
    }

    /// @dev Read only: every reporter that can be checked dispatches through DISPATCHER_ADDRESS and the route's Yaho.
    /// A reporter governed by someone else that does not point at DISPATCHER_ADDRESS yet gets its governor action
    /// printed and fails the check; any reporter not pointing at DISPATCHER_ADDRESS reverts. The deployer is
    /// DEPLOYER_ADDRESS when set, so a governor signer needs no key, else the DEPLOYER_KEY address.
    function check() external view {
        address deployer = _checkDeployer();
        (address target, address yaho) = _dispatcherSetup();

        string memory failed;
        console.log("SetDispatcher check, chain", block.chainid, "dispatcher", target);
        for (uint256 i = 0; i < REPORTER_KEYS.length; i++) {
            DispatcherEntry memory entry = _dispatcherClassify(REPORTER_KEYS[i], deployer, target, yaho);
            string memory line = string.concat("  ", entry.key, ": ");
            if (entry.status == DispatcherStatus.ALREADY) {
                console.log(string.concat(line, "OK"), entry.reporter);
            } else if (entry.status == DispatcherStatus.FOREIGN) {
                console.log(string.concat(line, "not proven: governor action pending"), entry.reporter);
                _dispatcherGovernorAction(entry, target);
                failed = string.concat(failed, " ", entry.key, " (governor action pending)");
            } else if (entry.status == DispatcherStatus.TODO || entry.status == DispatcherStatus.REPLACE) {
                console.log(string.concat(line, "MISMATCH, dispatcher is"), entry.current);
                failed = string.concat(failed, " ", entry.key);
            } else {
                _dispatcherLog(entry, _dispatcherLabel(entry.status, false));
            }
        }
        require(
            bytes(failed).length == 0,
            string.concat(
                "reporters not pointing at DISPATCHER_ADDRESS:",
                failed,
                " (run deploy-route.sh --set-dispatcher; a reporter the governor holds needs the action printed above)"
            )
        );
    }

    /// @dev DISPATCHER_ADDRESS (required) and the route's Yaho (with code), the dispatcher checked against it.
    function _dispatcherSetup() private view returns (address target, address yaho) {
        _requireReporterChain();
        target = _envAddressRequired("DISPATCHER_ADDRESS");
        (bool exists, ) = _stateJson();
        require(exists, string.concat(_statePath(), " missing: deploy the route first"));
        // Never _resolveYaho: this script does not write the route file.
        yaho = _tryResolveYaho();
        require(yaho != address(0), "no Yaho: set YAHO_ADDRESS or deploy the route with --hashi first");
        _requireCode("Yaho", yaho);
        _checkDispatcher(target, yaho);
    }

    /// @dev Reads one reporter and classifies it. A recorded address without code, or a reporter that accepts
    /// another Yaho than the route's, reverts.
    function _dispatcherClassify(
        string memory key,
        address deployer,
        address target,
        address yaho
    ) private view returns (DispatcherEntry memory entry) {
        entry.key = key;
        entry.reporter = _stateAddressOrZero(string.concat(".", key));
        if (entry.reporter == address(0)) return entry; // MISSING
        _requireCode(string.concat(key, " (route file)"), entry.reporter);

        (bool okDispatcher, address current) = _dispatcherGetAddress(entry.reporter, "dispatcher()");
        (bool okGovernor, address governor) = _dispatcherGetAddress(entry.reporter, "governor()");
        if (!okDispatcher || !okGovernor) {
            entry.status = DispatcherStatus.LEGACY;
            return entry;
        }
        entry.current = current;

        (bool okYaho, address reporterYaho) = _dispatcherGetAddress(entry.reporter, "YAHO()");
        require(
            okYaho && reporterYaho == yaho,
            string.concat(
                key,
                " accepts Yaho ",
                vm.toString(reporterYaho),
                ", the route's Yaho is ",
                vm.toString(yaho),
                ": it does not belong to this route"
            )
        );
        if (current == target) entry.status = DispatcherStatus.ALREADY;
        else if (governor != deployer) entry.status = DispatcherStatus.FOREIGN;
        else if (current != address(0)) entry.status = DispatcherStatus.REPLACE;
        else entry.status = DispatcherStatus.TODO;
    }

    /// @dev An address getter as a raw staticcall: false when it reverts or returns anything but one address word.
    function _dispatcherGetAddress(address account, string memory getter) private view returns (bool, address) {
        (bool ok, bytes memory ret) = account.staticcall(abi.encodeWithSignature(getter));
        if (!ok || ret.length != 32 || uint256(bytes32(ret)) >> 160 != 0) return (false, address(0));
        return (true, abi.decode(ret, (address)));
    }

    function _dispatcherGovernorAction(DispatcherEntry memory entry, address target) private view {
        console.log(
            string.concat("GOVERNOR ACTION for ", entry.key, " (governed by another account), chain"),
            block.chainid
        );
        console.log("  to:   ", entry.reporter);
        console.log("  value: 0");
        console.log(string.concat("  data:  ", vm.toString(abi.encodeCall(Reporter.setDispatcher, (target)))));
        console.log(string.concat('  (cast calldata "setDispatcher(address)" ', vm.toString(target), ")"));
        if (entry.current != address(0)) {
            console.log("  replaces dispatcher", entry.current, "and voids a dispatch in flight through it");
        }
    }

    function _dispatcherLog(DispatcherEntry memory entry, string memory label) private pure {
        string memory line = string.concat("  ", entry.key, ": ", label);
        if (entry.reporter == address(0)) console.log(line);
        else console.log(line, entry.reporter);
    }

    function _dispatcherLabel(DispatcherStatus status, bool afterRun) private pure returns (string memory) {
        if (status == DispatcherStatus.MISSING) return "missing (not in the route file)";
        if (status == DispatcherStatus.LEGACY) return "legacy (pre-#529 reporter, skipped)";
        if (status == DispatcherStatus.ALREADY) return "already set";
        if (status == DispatcherStatus.FOREIGN) return "foreign (governor action printed above)";
        if (status == DispatcherStatus.REPLACE) return afterRun ? "replaced" : "points at another dispatcher";
        return afterRun ? "set" : "not set";
    }
}
