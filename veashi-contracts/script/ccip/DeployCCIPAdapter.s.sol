// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../src/chainlink/CCIPReporter.sol";
import "../../src/chainlink/CCIPAdapter.sol";
import "../helpers/DeploymentState.sol";

contract DeployCCIPAdapter is DeploymentState {
    function run() external {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(pk);

        //
        // Deploy & configure CCIPAdapter
        //
        address router = vm.envAddress("CCIP_ADAPTER_ROUTER");
        CCIPAdapter adapter = new CCIPAdapter(router);
        _updateLocal("ccipAdapter", address(adapter));
        console.log(" CCIPAdapter deployed at:", address(adapter));

        // read chain‐specific setup from env
        uint256 reportChainId = vm.envUint("REPORTER_CHAIN_ID");
        uint64 reportChainSelector = uint64(vm.envUint("CCIP_REPORTER_CHAIN_SELECTOR"));
        address reporter = _loadAddress(".ccipReporter");

        // use the same chainId + selector + reporter address to wire up the adapter
        adapter.setReporterByChain(reportChainId, reportChainSelector, reporter);

        vm.stopBroadcast();
    }
}
