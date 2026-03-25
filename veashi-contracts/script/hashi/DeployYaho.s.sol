// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@hashi/Yaho.sol";
import {DeploymentState} from "../helpers/DeploymentState.sol";

contract DeployYaho is DeploymentState {
    function run() external returns (address) {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        Yaho yaho = new Yaho();
        vm.stopBroadcast();
        _updateLocal("yaho", address(yaho));
        console.log("Deployed Yaho at:", address(yaho));
        return address(yaho);
    }
}
