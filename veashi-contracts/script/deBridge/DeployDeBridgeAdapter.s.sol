// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../src/adapters/deBridge/DeBridgeAdapter.sol";
import "../helpers/DeploymentState.sol";

contract DeployDeBridgeAdapter is DeploymentState {
    function run() external {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(pk);

        //
        // Deploy & configure DeBridgeAdapter
        //
        address adapterDeBridgeGate = vm.envAddress("DEBRIDGE_ADAPTER_GATE_ADDRESS");
        DeBridgeAdapter adapter = new DeBridgeAdapter(adapterDeBridgeGate);
        _updateLocal("deBridgeAdapter", address(adapter));
        console.log(" DeBridgeAdapter deployed at:", address(adapter));

        // // read chain‐specific setup from env
        uint256 reporterChainId = vm.envUint("DEBRIDGE_REPORTER_CHAIN_ID");
        address reporter = _loadAddress(".deBridgeReporter");

        // Set reporter for the given chainId
        adapter.setReporterByChainId(reporterChainId, reporter);

        vm.stopBroadcast();
    }
}
