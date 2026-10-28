// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {CCIPAdapter} from "../../src/adapters/chainlink/CCIPAdapter.sol";
import {CCIPInputs, CCIPAdapterInputs} from "./CCIPInputs.sol";

contract DeployCCIPAdapter is CCIPInputs {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireAdapterChain();
        _requireNotDeployed("ccipAdapter");

        CCIPAdapterInputs memory inputs = _ccipAdapterInputs();
        address reporter = _loadAddress(".ccipReporter");
        require(reporter != address(0), "ccipReporter is zero in deployment state");

        vm.startBroadcast(pk);
        CCIPAdapter adapter = new CCIPAdapter(inputs.router, deployer);
        adapter.setReporterByChain(REPORTER_CHAIN_ID, inputs.reporterChainSelector, reporter);
        vm.stopBroadcast();
        console.log("CCIPAdapter deployed at:", address(adapter));

        require(adapter.getRouter() == inputs.router, "CCIPAdapter router mismatch");
        require(adapter.governor() == deployer, "CCIPAdapter governor is not the deployer");
        require(
            adapter.enabledReporters(inputs.reporterChainSelector) == reporter,
            "CCIPAdapter enabledReporters(CCIP_REPORTER_CHAIN_SELECTOR) mismatch"
        );
        // The adapter rejects every message from a selector mapped to chain id 0.
        uint256 chainId = adapter.chainIds(inputs.reporterChainSelector);
        require(
            chainId != 0 && chainId == REPORTER_CHAIN_ID,
            "CCIPAdapter chainIds(CCIP_REPORTER_CHAIN_SELECTOR) mismatch"
        );

        _updateLocal("ccipAdapter", address(adapter));
    }
}
