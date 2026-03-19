// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../../src/layerZero/LayerZeroReporter.sol";
import {SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {MessageLibManager} from "@layerzerolabs/lz-evm-protocol-v2/contracts/MessageLibManager.sol";
import {DeploymentState} from "../helpers/DeploymentState.sol";

contract ConfigureLZReporter is DeploymentState {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    function run() external {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address lzEndpoint = vm.envAddress("LZ_REPORTER_ENDPOINT");
        uint256 chainId = vm.envUint("ADAPTER_CHAIN_ID");
        uint32 eid = uint32(vm.envUint("LZ_ADAPTER_EID"));
        address sendLib = vm.envAddress("LZ_SEND_LIB");
        address executor = vm.envAddress("LZ_EXECUTOR");
        uint128 gasLimit = uint128(vm.envUint("LZ_DEFAULT_FEE"));
        address reporterAddress = _loadAddress(".lzReporter");
        address adapter = _loadAddress(".lzAdapter");

        vm.startBroadcast(pk);
        LayerZeroReporter reporter = LayerZeroReporter(payable(reporterAddress));
        reporter.setGasLimit(gasLimit);
        // Allow the adapter to receive messages
        reporter.setPeer(eid, bytes32(uint256(uint160(adapter))));
        console.log("Peer set for adapter");

        reporter.setEndpointIdByChainId(chainId, eid);
        console.log("Endpoint set for adapter chainId");

        (bool success, ) = payable(address(reporter)).call{value: 0.001 ether}("");
        require(success, "ETH transfer to reporter failed");
        console.log("Funded reporter with 0.001 ETH");

        // Set the DVN config as reporter
        address[] memory optionalDVNs = new address[](0);
        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = address(0x53f488E93b4f1b60E8E83aa374dBe1780A1EE8a8);

        UlnConfig memory uln = UlnConfig({
            confirmations: 15, // minimum block confirmations required
            requiredDVNCount: 1, // number of DVNs required
            optionalDVNCount: 0, // optional DVNs count, uint8
            optionalDVNThreshold: 0, // optional DVN threshold
            requiredDVNs: requiredDVNs, // sorted list of required DVN addresses
            optionalDVNs: optionalDVNs // sorted list of optional DVNs
        });

        /// @notice ExecutorConfig sets message size limit + fee‑paying executor
        ExecutorConfig memory exec = ExecutorConfig({
            maxMessageSize: 10000, // max bytes per cross-chain message
            executor: executor // address that pays destination execution fees
        });

        bytes memory encodedUln = abi.encode(uln);
        bytes memory encodedExec = abi.encode(exec);

        SetConfigParam[] memory params = new SetConfigParam[](2);
        params[0] = SetConfigParam(eid, EXECUTOR_CONFIG_TYPE, encodedExec);
        params[1] = SetConfigParam(eid, ULN_CONFIG_TYPE, encodedUln);

        MessageLibManager(lzEndpoint).setConfig(address(reporter), sendLib, params);
        console.log("Config set successfully.");

        vm.stopBroadcast();
    }
}
