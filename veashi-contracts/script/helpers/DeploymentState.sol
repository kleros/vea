// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

abstract contract DeploymentState is Script {
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
                        UPDATE LOCAL STATE
    //////////////////////////////////////////////////////////////*/

    function _updateLocal(string memory key, address value) internal {
        string memory path = _statePath();
        string memory json = vm.exists(path) ? vm.readFile(path) : "{}";

        // Start from existing JSON or empty object
        vm.serializeJson("hashi", json);

        // IMPORTANT:
        // serializeAddress will first try to parse `json` as stringified JSON.
        // If parsing succeeds, it MERGES the key.
        // If parsing fails, it treats `json` as a plain string and creates a new object.
        json = vm.serializeAddress("hashi", key, value);

        vm.writeJson(json, path);
    }

    function _loadAddress(string memory key) internal view returns (address) {
        string memory path = string.concat(
            vm.projectRoot(),
            "/broadcast/",
            vm.toString(REPORTER_CHAIN_ID),
            "-",
            vm.toString(ADAPTER_CHAIN_ID),
            ".json"
        );

        string memory json = vm.readFile(path);
        bytes memory raw = vm.parseJson(json, key);
        require(raw.length != 0, string.concat(key, " missing in deployment state"));
        return abi.decode(raw, (address));
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
