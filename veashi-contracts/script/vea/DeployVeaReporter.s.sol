// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../../src/adapters/vea/VeaAdapter.sol";
import "../../src/adapters/vea/VeaReporter.sol";
import {IVeaInbox} from "../../src/adapters/vea/interfaces/IVeaInbox.sol";
import "../helpers/DeploymentState.sol";

contract DeployVeaReporter is DeploymentState {
    function run() external {
        // start broadcasting as your deployer
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);

        //
        // Deploy the reporter, pointing at that adapter
        //
        address yahoAddress = vm.envAddress("YAHO_ADDRESS");
        address veaInboxAddress = vm.envAddress("VEA_INBOX");
        uint256 targetChain = vm.envUint("VEA_TARGET_CHAIN_ID");
        address adapter = _loadAddress(".veaAdapter");

        VeaReporter reporter = new VeaReporter(
            yahoAddress,
            IVeaInbox(veaInboxAddress),
            adapter,
            targetChain,
            deployer, // governor
            deployer // keeper
        );
        console.log("VeaReporter deployed at:", address(reporter));

        vm.stopBroadcast();
    }
}
