// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {DeBridgeReporter} from "../../src/adapters/deBridge/DeBridgeReporter.sol";
import {PaidReporter} from "../../src/adapters/PaidReporter.sol";
import {IDeBridgeGateViews} from "../helpers/BridgeViews.sol";
import {DispatcherCheck} from "../helpers/DispatcherCheck.sol";
import {DeBridgeInputs} from "./DeBridgeInputs.sol";

contract DeployDeBridgeReporter is DeBridgeInputs, DispatcherCheck {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireReporterChain();
        _requireNotDeployed("deBridgeReporter");

        DeBridgeReporterInputs memory inputs = _deBridgeReporterInputs();
        address yaho = _resolveYaho(true);
        address keeper = _resolveKeeper(deployer);
        address dispatcher = _optionalDispatcher(yaho);

        vm.startBroadcast(pk);
        DeBridgeReporter reporter = new DeBridgeReporter(yaho, inputs.gate, deployer, keeper);
        // The reporter is keyed by EVM chain id; the gate needs deBridge's id for the target.
        reporter.setDeBridgeChainIdByChainId(ADAPTER_CHAIN_ID, inputs.adapterDeBridgeChainId);
        reporter.setFee(inputs.fee);
        if (dispatcher != address(0)) reporter.setDispatcher(dispatcher);
        vm.stopBroadcast();
        console.log("DeBridgeReporter deployed at:", address(reporter));

        require(reporter.YAHO() == yaho, "DeBridgeReporter YAHO mismatch");
        require(address(reporter.deBridgeGate()) == inputs.gate, "DeBridgeReporter deBridgeGate mismatch");
        require(reporter.governor() == deployer, "DeBridgeReporter governor mismatch");
        require(reporter.keeper() == keeper, "DeBridgeReporter keeper mismatch");
        require(reporter.dispatcher() == dispatcher, "DeBridgeReporter dispatcher mismatch");
        require(
            reporter.deBridgeChainIds(ADAPTER_CHAIN_ID) == inputs.adapterDeBridgeChainId,
            "DeBridgeReporter deBridgeChainIds mismatch"
        );
        require(reporter.fee() == inputs.fee, "DeBridgeReporter fee mismatch");

        // The adapter does not exist yet; the deBridge quote does not depend on it.
        (address token, uint256 quote) = _quote(
            PaidReporter(payable(address(reporter))),
            ADAPTER_CHAIN_ID,
            address(0),
            "deBridge"
        );
        require(
            token == address(0) && quote == inputs.fee + IDeBridgeGateViews(inputs.gate).globalFixedNativeFee(),
            "DeBridgeReporter quote is not fee + globalFixedNativeFee in native"
        );
        _fund(pk, reporter, token, quote, inputs.funding, "DEBRIDGE_REPORTER_FUNDING");

        _updateLocal("deBridgeReporter", address(reporter));
    }
}
