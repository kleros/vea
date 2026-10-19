// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {DeBridgeAdapter} from "../../src/adapters/deBridge/DeBridgeAdapter.sol";
import {DeBridgeInputs} from "./DeBridgeInputs.sol";

contract DeployDeBridgeAdapter is DeBridgeInputs {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireAdapterChain();
        _requireNotDeployed("deBridgeAdapter");

        DeBridgeAdapterInputs memory inputs = _deBridgeAdapterInputs();
        address reporter = _loadAddress(".deBridgeReporter");

        vm.startBroadcast(pk);
        DeBridgeAdapter adapter = new DeBridgeAdapter(inputs.gate, deployer);
        // The CallProxy reports the source by deBridge id; the reporter is enabled under the EVM id.
        adapter.setChainIdByDeBridgeChainId(inputs.reporterDeBridgeChainId, REPORTER_CHAIN_ID);
        adapter.setReporterByChainId(REPORTER_CHAIN_ID, reporter);
        vm.stopBroadcast();
        console.log("DeBridgeAdapter deployed at:", address(adapter));

        require(address(adapter.deBridgeGate()) == inputs.gate, "DeBridgeAdapter deBridgeGate mismatch");
        require(adapter.governor() == deployer, "DeBridgeAdapter governor mismatch");
        require(
            adapter.chainIds(inputs.reporterDeBridgeChainId) == REPORTER_CHAIN_ID,
            "DeBridgeAdapter chainIds mismatch"
        );
        require(adapter.enabledReporters(REPORTER_CHAIN_ID) == reporter, "DeBridgeAdapter enabledReporters mismatch");

        _updateLocal("deBridgeAdapter", address(adapter));
    }
}
