// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {LayerZeroReporter} from "../../src/adapters/layerZero/LayerZeroReporter.sol";
import {ILZEndpointViews} from "../helpers/BridgeViews.sol";
import {DispatcherCheck} from "../helpers/DispatcherCheck.sol";
import {LZInputs, LZReporterInputs} from "./LZInputs.sol";

/// @dev Deploys the reporter only. ConfigureLZReporter sets its peer, endpoint id and DVN config once the adapter
/// exists, and funds it.
contract DeployLZReporter is LZInputs, DispatcherCheck {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireReporterChain();
        _requireNotDeployed("lzReporter");

        LZReporterInputs memory inputs = _lzReporterInputs();
        address yaho = _resolveYaho(true);
        address keeper = _resolveKeeper(deployer);
        address dispatcher = _optionalDispatcher(yaho);

        vm.startBroadcast(pk);
        LayerZeroReporter reporter = new LayerZeroReporter(
            yaho,
            inputs.endpoint,
            deployer, // endpoint delegate: sets the DVN config in ConfigureLZReporter
            keeper, // refundAddress (never zero)
            inputs.gasLimit,
            deployer, // governor
            keeper
        );
        if (dispatcher != address(0)) reporter.setDispatcher(dispatcher);
        vm.stopBroadcast();
        console.log("LayerZeroReporter deployed at:", address(reporter));

        require(reporter.YAHO() == yaho, "LayerZeroReporter YAHO mismatch");
        require(address(reporter.LAYER_ZERO_ENDPOINT()) == inputs.endpoint, "LayerZeroReporter endpoint mismatch");
        require(reporter.governor() == deployer, "LayerZeroReporter governor is not the deployer");
        require(reporter.owner() == deployer, "LayerZeroReporter owner is not the deployer");
        require(
            ILZEndpointViews(inputs.endpoint).delegates(address(reporter)) == deployer,
            "LayerZeroReporter endpoint delegate is not the deployer"
        );
        require(reporter.keeper() == keeper, "LayerZeroReporter keeper mismatch");
        require(reporter.refundAddress() == keeper, "LayerZeroReporter refundAddress mismatch");
        require(reporter.dispatcher() == dispatcher, "LayerZeroReporter dispatcher mismatch");
        require(reporter.gasLimit() == inputs.gasLimit, "LayerZeroReporter gasLimit mismatch");
        console.log("gasLimit:", reporter.gasLimit());

        _updateLocal("lzReporter", address(reporter));
    }
}
