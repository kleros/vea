// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "@hashi/Yaru.sol";
import "@hashi/Hashi.sol";
import {HashiInputs} from "./HashiInputs.sol";

contract DeployYaru is HashiInputs {
    /// @dev Reuses the route's Yaru (YARU_ADDRESS or state `.yaru`) without a transaction once it checks out against
    /// the route's Yaho; otherwise deploys Hashi and a Yaru for messages from REPORTER_CHAIN_ID.
    function run() external returns (address) {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        _requireAdapterChain();
        bool force = _hashiForceNew();
        // Yaho lives on the reporter chain, so its code cannot be checked here.
        address yaho = _resolveYaho(false);
        (address reused, address hashi) = _hashiReusedYaru(force, yaho);

        if (reused != address(0)) {
            if (_stateAddressOrZero(".hashi") == address(0)) _updateLocal("hashi", hashi);
            if (_stateAddressOrZero(".yaru") == address(0)) _updateLocal("yaru", reused);
            console.log("reusing Yaru at:", reused);
            return reused;
        }
        address existing = _tryResolveYaru();

        vm.startBroadcast(pk);
        Hashi hashiDeployed = new Hashi();
        Yaru yaru = new Yaru(address(hashiDeployed), yaho, REPORTER_CHAIN_ID);
        vm.stopBroadcast();

        require(yaru.HASHI() == address(hashiDeployed), "Yaru HASHI mismatch");
        require(yaru.YAHO() == yaho, "Yaru YAHO mismatch");
        require(yaru.SOURCE_CHAIN_ID() == REPORTER_CHAIN_ID, "Yaru SOURCE_CHAIN_ID mismatch");

        if (existing != address(0)) console.log("FORCE_NEW_HASHI: replacing state .yaru", existing);
        console.log("Deployed Hashi at:", address(hashiDeployed));
        console.log("Deployed Yaru at:", address(yaru));
        _updateLocal("hashi", address(hashiDeployed));
        _updateLocal("yaru", address(yaru));
        return address(yaru);
    }
}
