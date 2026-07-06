// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../src/adapters/axelar/AxelarReporter.sol";
import "../../src/adapters/axelar/AxelarAdapter.sol";

import "../helpers/DeploymentState.sol";

contract DeployAxelarReporter is DeploymentState {
    function run() external {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(pk);

        //
        // Deploy & configure AxelarReporter
        //
        address headerStorage = vm.envAddress("HEADER_STORAGE");
        address yaho = vm.envAddress("YAHO_ADDRESS");
        address gateway = vm.envAddress("AXELAR_REPORTER_GATEWAY");
        address gasService = vm.envAddress("AXELAR_REPORTER_GAS_SERVICE");

        AxelarReporter reporter = new AxelarReporter(headerStorage, yaho, gateway, gasService);
        _updateLocal("axelarReporter", address(reporter));
        console.log("AxelarReporter deployed at:", address(reporter));

        // read chain-specific setup from env
        uint256 adapterChainId = vm.envUint("ADAPTER_CHAIN_ID");
        string memory adapterChainName = vm.envString("AXELAR_ADAPTER_CHAIN_NAME");

        // map the destination (adapter) chainId to its Axelar chain name
        reporter.setChainNameByChainId(adapterChainId, adapterChainName);

        // set the per-dispatch gas fee the reporter prepays from its own balance
        uint256 fee = vm.envUint("AXELAR_REPORTER_FEE");
        reporter.setFee(fee);

        // fund the reporter so it can prepay Axelar gas out of its own balance
        uint256 funding = vm.envUint("AXELAR_REPORTER_FUNDING");
        (bool sent, ) = address(reporter).call{value: funding}("");
        require(sent, "Failed to fund AxelarReporter");

        vm.stopBroadcast();
    }
}
