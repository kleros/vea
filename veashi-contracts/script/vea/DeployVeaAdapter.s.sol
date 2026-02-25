// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../../src/vea/VeaAdapter.sol";
import "../../src/vea/VeaReporter.sol";
import {IVeaInbox} from "../../src/vea/interfaces/IVeaInbox.sol";
import "../helpers/DeploymentState.sol";

contract DeployVeaAdapter is DeploymentState {
    function run() external {
        // start broadcasting as your deployer
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(pk);

        //
        // Deploy the adapter first
        //
        address veaOutbox = vm.envAddress("VEA_OUTBOX");
        uint256 sourceChain = vm.envUint("VEA_SOURCE_CHAIN_ID");
        VeaAdapter adapter = new VeaAdapter(veaOutbox, sourceChain);
        _updateLocal("veaAdapter", address(adapter));
        console.log("VeaAdapter deployed at:", address(adapter));

        vm.stopBroadcast();
    }
}

// Run after deployment
contract SetupVeaAdapter is DeploymentState {
    function run() external {
        // start broadcasting as your deployer
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address veaAdapter = vm.envAddress("VEA_ADAPTER");
        address reporter = _loadAddress(".veaReporter");

        vm.startBroadcast(pk);
        VeaAdapter adapter = VeaAdapter(veaAdapter);
        adapter.setReporter(reporter);
        console.log(" adapter.setReporter(", reporter, ")");
    }
}
