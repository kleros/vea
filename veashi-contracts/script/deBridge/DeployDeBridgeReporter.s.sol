// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../src/deBridge/DeBridgeReporter.sol";
import "../helpers/DeploymentState.sol";

contract DeployDeBridgeReporter is DeploymentState {
    function run() external {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address headerStorage = vm.envAddress("HEADER_STORAGE");
        address yaho = vm.envAddress("YAHO_ADDRESS");
        uint256 fee = vm.envUint("DEBRIDGE_REPORTER_FEE");
        address reporterDeBridgeGate = vm.envAddress("DEBRIDGE_REPORTER_GATE_ADDRESS");

        vm.startBroadcast(pk);

        //
        // Deploy & configure DeBridgeReporter
        //
        DeBridgeReporter reporter = new DeBridgeReporter(headerStorage, yaho, reporterDeBridgeGate);
        _updateLocal("deBridgeReporter", address(reporter));
        console.log(" DeBridgeReporter deployed at:", address(reporter));

        // Set the message fee
        reporter.setFee(fee);

        // fund the reporter
        (bool sent, ) = address(reporter).call{value: 0.1 ether}("");
        require(sent, "Failed to fund DeBridgeReporter");

        vm.stopBroadcast();
    }
}
