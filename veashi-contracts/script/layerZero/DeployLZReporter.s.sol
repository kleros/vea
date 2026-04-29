// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../../src/layerZero/LayerZeroReporter.sol";
import {SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {MessageLibManager} from "@layerzerolabs/lz-evm-protocol-v2/contracts/MessageLibManager.sol";
import {DeploymentState} from "../helpers/DeploymentState.sol";

contract DeployLZReporter is DeploymentState {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    function run() external returns (address) {
        // read deployer key and start broadcasting
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);

        address headerStorage = vm.envAddress("HEADER_STORAGE");
        address yaho = vm.envOr("YAHO_ADDRESS", address(0));
        address lzEndpoint = vm.envAddress("LZ_REPORTER_ENDPOINT");
        uint128 defaultFee = uint128(vm.envUint("LZ_DEFAULT_FEE"));

        if (yaho == address(0)) yaho = _loadAddress(".yaho");

        vm.startBroadcast(pk);
        LayerZeroReporter reporter = new LayerZeroReporter(
            headerStorage,
            yaho,
            lzEndpoint,
            deployer, // delegate
            deployer, // refundAddress
            defaultFee
        );
        vm.stopBroadcast();
        _updateLocal("lzReporter", address(reporter));
        console.log("Deployed LayerZeroReporter at:", address(reporter));
        return address(reporter);
    }
}
