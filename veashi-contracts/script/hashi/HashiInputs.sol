// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DeploymentState} from "../helpers/DeploymentState.sol";

/// @dev The pre-broadcast checks of DeployYaho and DeployYaru, kept apart so the route's preflight can run them too.
abstract contract HashiInputs is DeploymentState {
    /// @dev True when FORCE_NEW_HASHI is set. A forced Yaho or Yaru must come with an empty YAHO_ADDRESS and
    /// YARU_ADDRESS, and the route must hold no bridge or lightbulb contract yet: those point at the current Yaho
    /// and Yaru, so replacing either would leave a route that mixes two Hashi deployments.
    function _hashiForceNew() internal view returns (bool force) {
        force = _envFlag("FORCE_NEW_HASHI");
        if (!force) return false;
        require(
            !_envSet("YAHO_ADDRESS") && !_envSet("YARU_ADDRESS"),
            "FORCE_NEW_HASHI deploys a new Yaho and Yaru: leave YAHO_ADDRESS and YARU_ADDRESS empty"
        );
        (bool exists, string memory json) = _stateJson();
        if (!exists) return true;
        string[] memory keys = vm.parseJsonKeys(json, "$");
        for (uint256 i = 0; i < keys.length; i++) {
            string memory key = keys[i];
            require(
                !_contains(key, "Reporter") &&
                    !_contains(key, "Adapter") &&
                    keccak256(bytes(key)) != keccak256("switch") &&
                    keccak256(bytes(key)) != keccak256("lightbulb"),
                string.concat(
                    "FORCE_NEW_HASHI would leave a mixed route: archive the route file (",
                    _statePath(),
                    " holds ",
                    key,
                    ")"
                )
            );
        }
    }

    /// @dev The Yaru DeployYaru reuses (checked by `_hashiCheckYaru`) and its Hashi, or zeros when it deploys new
    /// ones: no Yaru in env or state, or FORCE_NEW_HASHI. Runs on the adapter chain.
    function _hashiReusedYaru(bool force, address yaho) internal view returns (address yaru, address hashi) {
        yaru = _tryResolveYaru();
        if (yaru == address(0) || force) return (address(0), address(0));
        hashi = _hashiCheckYaru(yaru, yaho);
    }

    /// @dev Checks an existing Yaru serves this route and returns its Hashi. Each failure names the check.
    function _hashiCheckYaru(address yaru, address yaho) internal view returns (address hashi) {
        _requireCode("Yaru", yaru);
        address yaruYaho = address(uint160(uint256(_hashiYaruWord(yaru, "YAHO()", true))));
        require(
            yaruYaho == yaho,
            string.concat(
                "Yaru YAHO() is ",
                vm.toString(yaruYaho),
                ", the route's Yaho is ",
                vm.toString(yaho),
                _hashiReplaceYaruHint()
            )
        );
        uint256 sourceChainId = uint256(_hashiYaruWord(yaru, "SOURCE_CHAIN_ID()", false));
        require(
            sourceChainId == REPORTER_CHAIN_ID,
            string.concat(
                "Yaru SOURCE_CHAIN_ID() is ",
                vm.toString(sourceChainId),
                ", REPORTER_CHAIN_ID is ",
                vm.toString(REPORTER_CHAIN_ID),
                _hashiReplaceYaruHint()
            )
        );
        hashi = address(uint160(uint256(_hashiYaruWord(yaru, "HASHI()", true))));
        _requireCode("Yaru HASHI()", hashi);
        address stateHashi = _stateAddressOrZero(".hashi");
        require(
            stateHashi == address(0) || stateHashi == hashi,
            string.concat("Yaru HASHI() is ", vm.toString(hashi), ", state .hashi is ", vm.toString(stateHashi))
        );
    }

    /// @dev One word returned by a getter of `yaru`, with a clear message when the contract is not a Yaru.
    function _hashiYaruWord(address yaru, string memory getter, bool isAddress) internal view returns (bytes32 word) {
        (bool ok, bytes memory ret) = yaru.staticcall(abi.encodeWithSignature(getter));
        if (ok && ret.length == 32) word = abi.decode(ret, (bytes32));
        require(
            ok && ret.length == 32 && (!isAddress || uint256(word) >> 160 == 0),
            string.concat(vm.toString(yaru), " is not a Yaru: ", getter, " failed")
        );
    }

    function _hashiReplaceYaruHint() private pure returns (string memory) {
        return
            ": this Yaru serves another route; to replace only the Yaru, run DeployYaru with FORCE_NEW_HASHI=true "
            "(README per-step command), or fix YARU_ADDRESS / state .yaru";
    }
}
