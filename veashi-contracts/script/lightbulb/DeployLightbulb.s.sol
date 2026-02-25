// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../../src/HashiLightbulb.sol";
import "../helpers/DeploymentState.sol";

contract DeployLightbulb is DeploymentState {
    function run() external {
        // start broadcasting as your deployer
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        uint256 sourceChainId = vm.envUint("REPORTER_CHAIN_ID");
        address yaru = vm.envOr("YARU_ADDRESS", address(0));
        if (yaru == address(0)) yaru = _loadAddress(".yaru");
        address switchAddress = _loadAddress(".switch");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        Lightbulb lightbulb = new Lightbulb(deployer, yaru, switchAddress, sourceChainId);
        _updateLocal("lightbulb", address(lightbulb));

        console.log("Lightbulb deployed at:", address(lightbulb));
        vm.stopBroadcast();
    }
}
