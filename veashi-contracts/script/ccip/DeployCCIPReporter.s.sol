// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {CCIPReporter} from "../../src/adapters/chainlink/CCIPReporter.sol";
import {DispatcherCheck} from "../helpers/DispatcherCheck.sol";
import {CCIPInputs, CCIPReporterInputs} from "./CCIPInputs.sol";

contract DeployCCIPReporter is CCIPInputs, DispatcherCheck {
    /// @dev Stands in for the adapter, which is deployed later on the other chain; the fee does not depend on it.
    address private constant PLACEHOLDER_ADAPTER = address(0xdead);

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireReporterChain();
        _requireNotDeployed("ccipReporter");

        CCIPReporterInputs memory inputs = _ccipReporterInputs();
        address yaho = _resolveYaho(true);
        address keeper = _resolveKeeper(deployer);
        address dispatcher = _optionalDispatcher(yaho);

        vm.startBroadcast(pk);
        CCIPReporter reporter = new CCIPReporter(yaho, inputs.router, deployer, keeper);
        reporter.setChainSelectorByChainId(ADAPTER_CHAIN_ID, inputs.adapterChainSelector);
        if (inputs.feeToken != address(0)) reporter.setFeeToken(inputs.feeToken);
        if (inputs.gasLimitSet) reporter.setDefaultGasLimit(inputs.gasLimit);
        if (dispatcher != address(0)) reporter.setDispatcher(dispatcher);
        vm.stopBroadcast();
        console.log("CCIPReporter deployed at:", address(reporter));

        require(reporter.YAHO() == yaho, "CCIPReporter YAHO mismatch");
        require(address(reporter.CCIP_ROUTER()) == inputs.router, "CCIPReporter CCIP_ROUTER mismatch");
        require(reporter.governor() == deployer, "CCIPReporter governor is not the deployer");
        require(reporter.keeper() == keeper, "CCIPReporter keeper mismatch");
        require(reporter.dispatcher() == dispatcher, "CCIPReporter dispatcher mismatch");
        require(
            reporter.chainSelectors(ADAPTER_CHAIN_ID) == inputs.adapterChainSelector,
            "CCIPReporter chainSelectors(ADAPTER_CHAIN_ID) mismatch"
        );
        require(reporter.feeToken() == inputs.feeToken, "CCIPReporter feeToken mismatch");
        if (inputs.gasLimitSet) {
            require(reporter.defaultGasLimit() == inputs.gasLimit, "CCIPReporter defaultGasLimit mismatch");
        } else {
            console.log("CCIP_GAS_LIMIT unset: contract default 200000 kept");
        }
        console.log("defaultGasLimit:", reporter.defaultGasLimit());

        (address token, uint256 quote) = _quote(reporter, ADAPTER_CHAIN_ID, PLACEHOLDER_ADAPTER, "ccip");
        _fund(pk, reporter, token, quote, inputs.funding, "CCIP_REPORTER_FUNDING");

        _updateLocal("ccipReporter", address(reporter));
    }
}
