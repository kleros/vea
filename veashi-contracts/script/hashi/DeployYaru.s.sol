// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@hashi/Yaru.sol";
import "@hashi/Hashi.sol";
import {DeploymentState} from "../helpers/DeploymentState.sol";

contract DeployYaru is DeploymentState {
    function run() external returns (address) {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        address yahoAddress = _loadAddress(".yaho");
        vm.startBroadcast(pk);
        Hashi hashi = new Hashi();
        Yaru yaru = new Yaru(address(hashi), yahoAddress, REPORTER_CHAIN_ID);
        vm.stopBroadcast();
        _updateLocal("hashi", address(hashi));
        _updateLocal("yaru", address(yaru));
        console.log("Deployed yaru at:", address(yaru));
        return address(yaru);
    }
}
