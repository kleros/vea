// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {VeaReporter} from "../../src/adapters/vea/VeaReporter.sol";
import {IVeaInbox} from "../../src/adapters/vea/interfaces/IVeaInbox.sol";
import {DispatcherCheck} from "../helpers/DispatcherCheck.sol";
import {VeaInputs} from "./VeaInputs.sol";

/// @notice Deploys the VeaReporter on the reporter chain, bound to the route's VeaAdapter. Vea charges no
/// fee, so the reporter needs no funding.
contract DeployVeaReporter is VeaInputs, DispatcherCheck {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireReporterChain();
        _requireNotDeployed("veaReporter");
        VeaReporterInputs memory inputs = _veaReporterInputs();

        address adapter = _loadAddress(".veaAdapter");
        require(adapter != address(0), "veaAdapter is zero in deployment state");
        address yaho = _resolveYaho(true);
        address keeper = _resolveKeeper(deployer);
        address dispatcher = _optionalDispatcher(yaho);

        vm.startBroadcast(pk);
        VeaReporter reporter = new VeaReporter(
            yaho,
            IVeaInbox(inputs.inbox),
            adapter,
            ADAPTER_CHAIN_ID,
            deployer, // governor
            keeper
        );
        if (dispatcher != address(0)) reporter.setDispatcher(dispatcher);
        vm.stopBroadcast();

        require(reporter.YAHO() == yaho, "VeaReporter YAHO mismatch");
        require(address(reporter.VEA_INBOX()) == inputs.inbox, "VeaReporter VEA_INBOX mismatch");
        require(reporter.ADAPTER() == adapter, "VeaReporter ADAPTER mismatch");
        require(
            reporter.EXPECTED_TARGET_CHAIN_ID() == ADAPTER_CHAIN_ID,
            "VeaReporter EXPECTED_TARGET_CHAIN_ID mismatch"
        );
        require(reporter.governor() == deployer, "VeaReporter governor mismatch");
        require(reporter.keeper() == keeper, "VeaReporter keeper mismatch");
        require(reporter.dispatcher() == dispatcher, "VeaReporter dispatcher mismatch");
        console.log("VeaReporter deployed at:", address(reporter));

        _updateLocal("veaReporter", address(reporter));
    }
}
