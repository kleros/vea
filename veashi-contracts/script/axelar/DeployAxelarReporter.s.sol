// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {AxelarReporter} from "../../src/adapters/axelar/AxelarReporter.sol";
import {DispatcherCheck} from "../helpers/DispatcherCheck.sol";
import {AxelarInputs} from "./AxelarInputs.sol";

contract DeployAxelarReporter is AxelarInputs, DispatcherCheck {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireReporterChain();
        _requireNotDeployed("axelarReporter");

        AxelarReporterInputs memory inputs = _axelarReporterInputs();
        address yaho = _resolveYaho(true);
        address keeper = _resolveKeeper(deployer);
        address dispatcher = _optionalDispatcher(yaho);

        vm.startBroadcast(pk);
        AxelarReporter reporter = new AxelarReporter(yaho, inputs.gateway, inputs.gasService, deployer, keeper);
        reporter.setChainNameByChainId(ADAPTER_CHAIN_ID, inputs.adapterChainName);
        reporter.setFee(inputs.fee);
        if (dispatcher != address(0)) reporter.setDispatcher(dispatcher);
        vm.stopBroadcast();
        console.log("AxelarReporter deployed at:", address(reporter));

        require(reporter.YAHO() == yaho, "AxelarReporter YAHO mismatch");
        require(address(reporter.AXELAR_GATEWAY()) == inputs.gateway, "AxelarReporter AXELAR_GATEWAY mismatch");
        require(
            address(reporter.AXELAR_GAS_SERVICE()) == inputs.gasService,
            "AxelarReporter AXELAR_GAS_SERVICE mismatch"
        );
        require(reporter.governor() == deployer, "AxelarReporter governor mismatch");
        require(reporter.keeper() == keeper, "AxelarReporter keeper mismatch");
        require(reporter.dispatcher() == dispatcher, "AxelarReporter dispatcher mismatch");
        require(
            keccak256(bytes(reporter.chainNames(ADAPTER_CHAIN_ID))) == keccak256(bytes(inputs.adapterChainName)),
            "AxelarReporter chainNames(ADAPTER_CHAIN_ID) mismatch"
        );
        require(reporter.fee() == inputs.fee, "AxelarReporter fee mismatch");

        // The adapter is deployed after the reporter; Axelar's quote is the flat fee and ignores it.
        (address token, uint256 quote) = _quote(reporter, ADAPTER_CHAIN_ID, address(0), "axelar");
        _fund(pk, reporter, token, quote, inputs.funding, "AXELAR_REPORTER_FUNDING");

        _updateLocal("axelarReporter", address(reporter));
    }
}
