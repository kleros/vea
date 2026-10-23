// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

abstract contract DeploymentState is Script {
    /// @dev Marks a route file written for the PR #529 contracts (governor, keeper, one dispatcher per reporter).
    /// Route files without it are pre-#529 deployments: the scripts refuse them, so archive such a file outside
    /// broadcast/ before deploying that chain pair again.
    string internal constant STATE_VERSION = "2";

    uint256 internal REPORTER_CHAIN_ID = vm.envUint("REPORTER_CHAIN_ID");
    uint256 internal ADAPTER_CHAIN_ID = vm.envUint("ADAPTER_CHAIN_ID");

    /*//////////////////////////////////////////////////////////////
                                PATH
    //////////////////////////////////////////////////////////////*/

    function _statePath() internal view returns (string memory) {
        return
            string.concat(
                vm.projectRoot(),
                "/broadcast/",
                vm.toString(REPORTER_CHAIN_ID),
                "-",
                vm.toString(ADAPTER_CHAIN_ID),
                ".json"
            );
    }

    /*//////////////////////////////////////////////////////////////
                            READ STATE
    //////////////////////////////////////////////////////////////*/

    /// @dev The route file, checked for the current STATE_VERSION; `exists` is false when there is none yet.
    function _stateJson() internal view returns (bool exists, string memory json) {
        string memory path = _statePath();
        if (!vm.exists(path)) return (false, "");
        json = vm.readFile(path);
        _checkStateVersion(path, json);
        return (true, json);
    }

    function _checkStateVersion(string memory path, string memory json) internal view {
        require(
            vm.keyExistsJson(json, ".stateVersion"),
            string.concat(
                path,
                " has no stateVersion: it records pre-#529 contracts. Archive it outside broadcast/ to deploy this pair again"
            )
        );
        string memory version = vm.parseJsonString(json, ".stateVersion");
        require(
            keccak256(bytes(version)) == keccak256(bytes(STATE_VERSION)),
            string.concat(path, " has stateVersion ", version, ", these scripts write ", STATE_VERSION)
        );
    }

    function _loadAddress(string memory key) internal view returns (address) {
        (bool exists, string memory json) = _stateJson();
        require(exists, string.concat(_statePath(), " missing: deploy the earlier steps first"));
        require(vm.keyExistsJson(json, key), string.concat(key, " missing in deployment state"));
        return vm.parseJsonAddress(json, key);
    }

    /// @dev The address under `key`, or zero when the route file or the key does not exist.
    function _stateAddressOrZero(string memory key) internal view returns (address) {
        (bool exists, string memory json) = _stateJson();
        if (!exists || !vm.keyExistsJson(json, key)) return address(0);
        return vm.parseJsonAddress(json, key);
    }

    /// @dev Refuses to deploy `key` again over a recorded contract: a second deploy would orphan the first one
    /// (governed by the deployer, possibly funded) and repoint the route at a fresh, unconfigured copy.
    function _requireNotDeployed(string memory key) internal view {
        address existing = _stateAddressOrZero(string.concat(".", key));
        require(
            existing == address(0),
            string.concat(
                key,
                " is already deployed at ",
                vm.toString(existing),
                " in ",
                _statePath(),
                ": finish the remaining steps with forge script (README), or archive the route file to deploy it again"
            )
        );
    }

    /*//////////////////////////////////////////////////////////////
                        UPDATE LOCAL STATE
    //////////////////////////////////////////////////////////////*/

    /// @dev Records `key` only in a --broadcast run. The body runs before forge sends the transactions, so
    /// deploy-route.sh restores the file when a step fails. forge --resume re-runs the body at the deployer's current
    /// nonce, so its addresses are wrong. A bare --resume never writes (and forge prints no script output then, so
    /// nothing warns that the key is missing), but --broadcast --resume runs in ScriptBroadcast context and cannot be
    /// detected; the README forbids both.
    function _updateLocal(string memory key, address value) internal {
        if (vm.isContext(VmSafe.ForgeContext.ScriptResume)) return;
        if (!_broadcasting()) {
            console.log("state not written (not a broadcast):", key, value);
            return;
        }
        string memory path = _statePath();
        (bool exists, string memory json) = _stateJson();

        // Start from the existing JSON or an empty object. serializeJson parses `json` and merges the keys below.
        vm.serializeJson("hashi", exists ? json : "{}");
        vm.serializeString("hashi", "stateVersion", STATE_VERSION);
        json = vm.serializeAddress("hashi", key, value);

        vm.writeJson(json, path);
    }

    function _broadcasting() internal view returns (bool) {
        return vm.isContext(VmSafe.ForgeContext.ScriptBroadcast);
    }

    /*//////////////////////////////////////////////////////////////
                            CHAIN AND CODE
    //////////////////////////////////////////////////////////////*/

    function _requireReporterChain() internal view {
        _requireChain("REPORTER_CHAIN_ID", REPORTER_CHAIN_ID);
    }

    function _requireAdapterChain() internal view {
        _requireChain("ADAPTER_CHAIN_ID", ADAPTER_CHAIN_ID);
    }

    function _requireChain(string memory name, uint256 expected) private view {
        require(REPORTER_CHAIN_ID != ADAPTER_CHAIN_ID, "REPORTER_CHAIN_ID and ADAPTER_CHAIN_ID must differ");
        require(
            block.chainid == expected,
            string.concat(
                "wrong chain: ",
                name,
                " is ",
                vm.toString(expected),
                " but the RPC is chain ",
                vm.toString(block.chainid)
            )
        );
    }

    /// @dev `account` is a contract on this chain: nonzero, with code, and not an EOA with an EIP-7702 delegation.
    function _requireCode(string memory name, address account) internal view {
        require(account != address(0), string.concat(name, " is unset"));
        require(
            account.code.length > 0,
            string.concat(name, " ", vm.toString(account), " has no code on chain ", vm.toString(block.chainid))
        );
        require(
            !_is7702(account),
            string.concat(
                name,
                " ",
                vm.toString(account),
                " is an EOA with an EIP-7702 delegation on chain ",
                vm.toString(block.chainid),
                ", not a contract"
            )
        );
    }

    /// @dev An EOA with an EIP-7702 delegation: its code is the 23-byte designator 0xef0100 || delegate. EIP-3541 bars
    /// deployed code from starting with 0xEF, so no contract matches.
    function _is7702(address account) internal view returns (bool) {
        bytes memory c = account.code;
        return c.length == 23 && c[0] == 0xef && c[1] == 0x01 && c[2] == 0x00;
    }

    /*//////////////////////////////////////////////////////////////
                                ENV
    //////////////////////////////////////////////////////////////*/

    function _envSet(string memory key) internal view returns (bool) {
        return bytes(vm.envOr(key, string(""))).length != 0;
    }

    function _envUintRequired(string memory key) internal view returns (uint256) {
        require(_envSet(key), string.concat(key, " is unset"));
        return vm.envUint(key);
    }

    function _envUint32NonZero(string memory key) internal view returns (uint32) {
        uint256 value = _envUintRequired(key);
        require(value != 0 && value <= type(uint32).max, string.concat(key, " must be a nonzero uint32"));
        return uint32(value);
    }

    /// @dev A CCIP chain selector: nonzero and within uint64, so a mistyped digit fails instead of wrapping.
    function _envSelector(string memory key) internal view returns (uint64) {
        uint256 value = _envUintRequired(key);
        require(value != 0 && value <= type(uint64).max, string.concat(key, " must be a nonzero uint64"));
        return uint64(value);
    }

    function _envAddressRequired(string memory key) internal view returns (address value) {
        value = vm.envOr(key, address(0));
        require(value != address(0), string.concat(key, " is unset"));
    }

    function _envStringRequired(string memory key) internal view returns (string memory value) {
        value = vm.envOr(key, string(""));
        require(bytes(value).length != 0, string.concat(key, " is unset"));
    }

    function _envFlag(string memory key) internal view returns (bool) {
        return vm.envOr(key, false);
    }

    /*//////////////////////////////////////////////////////////////
                                ROLES
    //////////////////////////////////////////////////////////////*/

    /// @dev The deployer a read-only check() classifies against: DEPLOYER_ADDRESS when set, so a governor signer needs
    /// no key, else the DEPLOYER_KEY address. When both are set they must agree.
    function _checkDeployer() internal view returns (address deployer) {
        bool keySet = _envSet("DEPLOYER_KEY");
        if (_envSet("DEPLOYER_ADDRESS")) {
            deployer = vm.envAddress("DEPLOYER_ADDRESS");
            require(deployer != address(0), "DEPLOYER_ADDRESS is zero");
            if (keySet) {
                require(
                    vm.addr(vm.envUint("DEPLOYER_KEY")) == deployer,
                    "DEPLOYER_ADDRESS is not the address of DEPLOYER_KEY"
                );
            }
        } else {
            require(keySet, "check() needs DEPLOYER_ADDRESS (or DEPLOYER_KEY)");
            deployer = vm.addr(vm.envUint("DEPLOYER_KEY"));
        }
    }

    /// @dev KEEPER_ADDRESS, or the deployer when unset. The keeper receives every withdrawal of a paid reporter.
    function _resolveKeeper(address deployer) internal view returns (address keeper) {
        if (!_envSet("KEEPER_ADDRESS")) {
            keeper = deployer;
        } else {
            keeper = vm.envAddress("KEEPER_ADDRESS");
            require(keeper != address(0), "KEEPER_ADDRESS is zero");
        }
        if (keeper == deployer) {
            console.log("keeper is the deployer: HandOver refuses unless NEW_KEEPER or KEEP_DEPLOYER_KEEPER is set");
        }
    }

    /*//////////////////////////////////////////////////////////////
                            YAHO AND YARU
    //////////////////////////////////////////////////////////////*/

    /// @dev YAHO_ADDRESS or the route's `.yaho`, which must agree when both are set; zero when neither is.
    function _tryResolveYaho() internal view returns (address) {
        return _agree("YAHO_ADDRESS", ".yaho");
    }

    /// @dev YARU_ADDRESS or the route's `.yaru`, with the same rule.
    function _tryResolveYaru() internal view returns (address) {
        return _agree("YARU_ADDRESS", ".yaru");
    }

    /// @dev The route's Yaho, recorded in state when it came from YAHO_ADDRESS only. `onReporterChain` also checks
    /// its code (Yaho lives on the reporter chain).
    function _resolveYaho(bool onReporterChain) internal returns (address yaho) {
        yaho = _tryResolveYaho();
        require(yaho != address(0), "no Yaho: deploy it with --hashi or set YAHO_ADDRESS");
        if (onReporterChain) _requireCode("Yaho", yaho);
        if (_stateAddressOrZero(".yaho") == address(0)) _updateLocal("yaho", yaho);
    }

    function _agree(string memory envKey, string memory stateKey) private view returns (address) {
        address fromEnv = vm.envOr(envKey, address(0));
        address fromState = _stateAddressOrZero(stateKey);
        require(
            fromEnv == address(0) || fromState == address(0) || fromEnv == fromState,
            string.concat(
                envKey,
                " ",
                vm.toString(fromEnv),
                " differs from state ",
                stateKey,
                " ",
                vm.toString(fromState)
            )
        );
        return fromEnv != address(0) ? fromEnv : fromState;
    }

    /*//////////////////////////////////////////////////////////////
                            STRING UTILS
    //////////////////////////////////////////////////////////////*/

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);

        if (n.length > h.length) return false;

        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}
