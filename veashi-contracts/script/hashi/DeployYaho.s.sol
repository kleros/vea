// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "@hashi/Yaho.sol";
import {HashiInputs} from "./HashiInputs.sol";

contract DeployYaho is HashiInputs {
    /// @dev Reuses the route's Yaho (YAHO_ADDRESS or state `.yaho`) without a transaction, unless FORCE_NEW_HASHI
    /// asks for a new one.
    function run() external returns (address) {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        _requireReporterChain();
        bool force = _hashiForceNew();
        address existing = _tryResolveYaho();

        if (existing != address(0) && !force) {
            address yaho = _resolveYaho(true);
            console.log("reusing Yaho at:", yaho);
            return yaho;
        }

        vm.startBroadcast(pk);
        Yaho deployed = new Yaho();
        vm.stopBroadcast();

        if (existing != address(0)) console.log("FORCE_NEW_HASHI: replacing state .yaho", existing);
        console.log("Deployed Yaho at:", address(deployed));
        _updateLocal("yaho", address(deployed));
        return address(deployed);
    }
}
