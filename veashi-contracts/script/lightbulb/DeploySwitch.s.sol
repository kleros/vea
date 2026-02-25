// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../../src/HashiSwitch.sol";
import "../helpers/DeploymentState.sol";

contract DeploySwitch is DeploymentState {
    function run() external {
        // start broadcasting as your deployer
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address yaho = vm.envOr("YAHO_ADDRESS", address(0));
        if (yaho == address(0)) yaho = _loadAddress(".yaho");
        vm.startBroadcast(pk);
        Switch switchCon = new Switch(yaho);

        _updateLocal("switch", address(switchCon));
        console.log("Switch deployed at:", address(switchCon));

        vm.stopBroadcast();
    }
}
