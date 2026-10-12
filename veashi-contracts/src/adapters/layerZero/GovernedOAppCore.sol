// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {OAppCore} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppCore.sol";
import {Governed} from "../../governance/Governed.sol";

/// @title GovernedOAppCore
/// @dev Keeps LayerZero's OZ owner equal to the governor, so `setDelegate` (`onlyOwner`) answers to the governor.
/// The endpoint delegate is separate: `changeGovernor` does not move it, the governor calls `setDelegate`.
abstract contract GovernedOAppCore is Governed, OAppCore {
    error OwnershipFollowsGovernor();

    constructor() {
        _transferOwnership(governor);
    }

    /// @notice Only the governor sets peers.
    function setPeer(uint32 _eid, bytes32 _peer) public override onlyByGovernor {
        _setPeer(_eid, _peer);
    }

    /// @dev Ownership moves only with `changeGovernor`.
    function transferOwnership(address) public pure override {
        revert OwnershipFollowsGovernor();
    }

    /// @dev Ownership moves only with `changeGovernor`.
    function renounceOwnership() public pure override {
        revert OwnershipFollowsGovernor();
    }

    function _setGovernor(address newGovernor) internal virtual override {
        super._setGovernor(newGovernor);
        _transferOwnership(newGovernor);
    }
}
