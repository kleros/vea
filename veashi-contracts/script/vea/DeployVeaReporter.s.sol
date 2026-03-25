// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../../src/vea/VeaAdapter.sol";
import "../../src/vea/VeaReporter.sol";
import {IVeaInbox} from "../../src/vea/interfaces/IVeaInbox.sol";
import "../helpers/DeploymentState.sol";

contract DeployVeaReporter is DeploymentState {
    function run() external {
        // start broadcasting as your deployer
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(pk);

        //
        // Deploy the reporter, pointing at that adapter
        //
        address headerStorage = vm.envAddress("HEADER_STORAGE");
        address yahoAddress = vm.envAddress("YAHO_ADDRESS");
        address veaInboxAddress = vm.envAddress("VEA_INBOX");
        uint256 targetChain = vm.envUint("VEA_TARGET_CHAIN_ID");
        address adapter = _loadAddress(".veaAdapter");

        VeaReporter reporter = new VeaReporter(
            headerStorage,
            yahoAddress,
            IVeaInbox(veaInboxAddress),
            adapter,
            targetChain
        );
        console.log("VeaReporter deployed at:", address(reporter));

        vm.stopBroadcast();
    }
}
