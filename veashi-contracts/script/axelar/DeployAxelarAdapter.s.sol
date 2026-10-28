// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {AxelarAdapter} from "../../src/adapters/axelar/AxelarAdapter.sol";
import {AxelarInputs} from "./AxelarInputs.sol";

contract DeployAxelarAdapter is AxelarInputs {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireAdapterChain();
        _requireNotDeployed("axelarAdapter");

        AxelarAdapterInputs memory inputs = _axelarAdapterInputs();
        address reporter = _loadAddress(".axelarReporter");
        require(reporter != address(0), ".axelarReporter is zero in deployment state");

        // Axelar delivers the source address as an EIP-55 checksummed string and the adapter compares its hash,
        // so the reporter is stored checksummed (vm.toString returns that form).
        string memory reporterString = vm.toString(reporter);

        vm.startBroadcast(pk);
        AxelarAdapter adapter = new AxelarAdapter(inputs.gateway, deployer);
        adapter.setReporterByChain(REPORTER_CHAIN_ID, inputs.reporterChainName, reporterString);
        vm.stopBroadcast();
        console.log("AxelarAdapter deployed at:", address(adapter));

        bytes32 nameHash = keccak256(bytes(inputs.reporterChainName));
        require(address(adapter.gateway()) == inputs.gateway, "AxelarAdapter gateway mismatch");
        require(adapter.governor() == deployer, "AxelarAdapter governor mismatch");
        require(
            adapter.chainIds(nameHash) == REPORTER_CHAIN_ID,
            "AxelarAdapter chainIds(reporter chain name) mismatch"
        );
        require(
            adapter.enabledReporters(nameHash) == keccak256(bytes(reporterString)),
            "AxelarAdapter enabledReporters(reporter chain name) mismatch"
        );

        _updateLocal("axelarAdapter", address(adapter));
    }
}
