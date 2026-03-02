// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../src/chainlink/CCIPReporter.sol";
import "../../src/chainlink/CCIPAdapter.sol";

import "../helpers/DeploymentState.sol";

contract DeployCCIPReporter is DeploymentState {
    function run() external {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(pk);

        //
        // Deploy & configure CCIPReporter
        //
        address headerStorage = vm.envAddress("HEADER_STORAGE");
        address yaho = vm.envAddress("YAHO_ADDRESS");
        address router = vm.envAddress("CCIP_REPORTER_ROUTER");

        CCIPReporter reporter = new CCIPReporter(headerStorage, yaho, router);
        _updateLocal("ccipReporter", address(reporter));
        console.log("CCIPReporter deployed at:", address(reporter));

        // read chain‐specific setup from env
        uint256 adapterChainId = vm.envUint("CCIP_ADAPTER_CHAIN_ID");
        uint64 adapterChainSelector = uint64(vm.envUint("CCIP_ADAPTER_CHAIN_SELECTOR"));

        // set the selector
        reporter.setChainSelectorByChainId(adapterChainId, adapterChainSelector);

        // fund the reporter
        (bool sent, ) = address(reporter).call{value: 0.01 ether}("");
        require(sent, "Failed to fund CCIPReporter");

        vm.stopBroadcast();
    }
}
