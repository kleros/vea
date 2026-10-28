// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {VeaAdapter} from "../../src/adapters/vea/VeaAdapter.sol";
import {DeploymentState} from "../helpers/DeploymentState.sol";
import {VeaInputs} from "./VeaInputs.sol";

/// @notice Deploys the VeaAdapter on the adapter chain. It accepts hashes from the reporter chain once
/// SetupVeaAdapter points it at the VeaReporter.
contract DeployVeaAdapter is VeaInputs {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireAdapterChain();
        _requireNotDeployed("veaAdapter");
        VeaAdapterInputs memory inputs = _veaAdapterInputs();

        vm.startBroadcast(pk);
        VeaAdapter adapter = new VeaAdapter(inputs.outbox, REPORTER_CHAIN_ID, deployer);
        vm.stopBroadcast();

        require(adapter.VEA_OUTBOX() == inputs.outbox, "VeaAdapter VEA_OUTBOX mismatch");
        require(adapter.SOURCE_CHAIN_ID() == REPORTER_CHAIN_ID, "VeaAdapter SOURCE_CHAIN_ID mismatch");
        require(adapter.governor() == deployer, "VeaAdapter governor mismatch");
        console.log("VeaAdapter deployed at:", address(adapter));

        _updateLocal("veaAdapter", address(adapter));
    }
}

/// @notice Points the VeaAdapter at the VeaReporter. Runs on the adapter chain after DeployVeaReporter.
contract SetupVeaAdapter is DeploymentState {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireAdapterChain();

        VeaAdapter adapter = VeaAdapter(_loadAddress(".veaAdapter"));
        address reporter = _loadAddress(".veaReporter");
        _requireCode("veaAdapter", address(adapter));
        require(reporter != address(0), "veaReporter is zero in deployment state");
        require(adapter.SOURCE_CHAIN_ID() == REPORTER_CHAIN_ID, "veaAdapter SOURCE_CHAIN_ID is not REPORTER_CHAIN_ID");

        require(adapter.governor() == deployer, "veaAdapter handed over: the governor must call setReporter");
        if (adapter.REPORTER() == reporter) {
            console.log("VeaAdapter already accepts reporter", reporter, ": skipped");
            return;
        }

        vm.startBroadcast(pk);
        adapter.setReporter(reporter);
        vm.stopBroadcast();

        require(adapter.REPORTER() == reporter, "VeaAdapter REPORTER mismatch");
        console.log("VeaAdapter", address(adapter), "accepts reporter", reporter);
    }
}
