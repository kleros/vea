// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {IMessageLibManager} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {LayerZeroAdapter} from "../../src/adapters/layerZero/LayerZeroAdapter.sol";
import {ILZEndpointViews} from "../helpers/BridgeViews.sol";
import {LZInputs, LZAdapterInputs} from "./LZInputs.sol";

/// @dev Deploys the adapter, trusts the route's reporter, pins the receive library and sets the DVN config.
contract DeployLZAdapter is LZInputs {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        _requireAdapterChain();
        _requireNotDeployed("lzAdapter");

        LZAdapterInputs memory inputs = _lzAdapterInputs();
        address reporter = _loadAddress(".lzReporter");
        bytes32 peer = bytes32(uint256(uint160(reporter)));

        vm.startBroadcast(pk);
        LayerZeroAdapter adapter = new LayerZeroAdapter(inputs.endpoint, deployer, deployer);
        // lzReceive needs all three: the peer, the enabled reporter and a nonzero chain id for the eid.
        adapter.setPeer(inputs.reporterEid, peer);
        adapter.setReporterByChain(REPORTER_CHAIN_ID, inputs.reporterEid, reporter);
        _pinReceiveLib(inputs.endpoint, address(adapter), inputs.reporterEid, inputs.receiveLib);
        IMessageLibManager(inputs.endpoint).setConfig(
            address(adapter),
            inputs.receiveLib,
            _lzReceiveParams(inputs.reporterEid, inputs.uln)
        );
        vm.stopBroadcast();
        console.log("LayerZeroAdapter deployed at:", address(adapter));

        _verifyLz(
            inputs.endpoint,
            address(adapter),
            inputs.receiveLib,
            inputs.reporterEid,
            inputs.uln,
            false,
            address(0),
            0
        );
        require(adapter.LAYER_ZERO_ENDPOINT() == inputs.endpoint, "LayerZeroAdapter endpoint mismatch");
        require(adapter.governor() == deployer, "LayerZeroAdapter governor is not the deployer");
        require(adapter.owner() == deployer, "LayerZeroAdapter owner is not the deployer");
        require(
            ILZEndpointViews(inputs.endpoint).delegates(address(adapter)) == deployer,
            "LayerZeroAdapter endpoint delegate is not the deployer"
        );
        require(adapter.peers(inputs.reporterEid) == peer, "LayerZeroAdapter peers(LZ_REPORTER_EID) mismatch");
        require(
            adapter.enabledReporters(inputs.reporterEid) == reporter,
            "LayerZeroAdapter enabledReporters(LZ_REPORTER_EID) mismatch"
        );
        require(
            adapter.chainIds(inputs.reporterEid) == REPORTER_CHAIN_ID,
            "LayerZeroAdapter chainIds(LZ_REPORTER_EID) mismatch"
        );

        _updateLocal("lzAdapter", address(adapter));
    }
}
