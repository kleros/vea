// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../src/adapters/axelar/AxelarReporter.sol";
import "../../src/adapters/axelar/AxelarAdapter.sol";
import "../helpers/DeploymentState.sol";

contract DeployAxelarAdapter is DeploymentState {
    function run() external {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(pk);

        //
        // Deploy & configure AxelarAdapter
        //
        address gateway = vm.envAddress("AXELAR_ADAPTER_GATEWAY");
        AxelarAdapter adapter = new AxelarAdapter(gateway);
        _updateLocal("axelarAdapter", address(adapter));
        console.log("AxelarAdapter deployed at:", address(adapter));

        // read chain-specific setup from env
        uint256 reporterChainId = vm.envUint("REPORTER_CHAIN_ID");
        string memory reporterChainName = vm.envString("AXELAR_REPORTER_CHAIN_NAME");
        address reporter = _loadAddress(".axelarReporter");

        // Axelar delivers the source address as an EIP-55 checksummed hex string, so the
        // stored reporter must be checksummed for the adapter's keccak comparison to pass.
        // vm.toString(address) returns the checksummed form.
        string memory reporterString = vm.toString(reporter);

        // use the reporter chainId + Axelar chain name + reporter address to wire up the adapter
        adapter.setReporterByChain(reporterChainId, reporterChainName, reporterString);

        vm.stopBroadcast();
    }
}
