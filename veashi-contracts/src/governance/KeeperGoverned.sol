// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Governed} from "./Governed.sol";

/// @title KeeperGoverned
/// @dev Adds a keeper to `Governed`: the keeper may move operating values within guardrails
/// (at most `keeperMaxChangeBps` per update, at most one update per `keeperCooldown` for each value,
/// never off zero), while the governor moves them freely.
abstract contract KeeperGoverned is Governed {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_KEEPER_COOLDOWN = 365 days;

    address public keeper;
    uint256 public keeperMaxChangeBps = 500;
    uint256 public keeperCooldown = 1 hours;
    /// @dev Timestamp of the keeper's last update of each value, 0 if the keeper never updated it.
    mapping(bytes32 => uint256) public keeperLastUpdate;

    error GovernorOrKeeperOnly();
    error KeeperNotSet();
    error KeeperCooldownActive(bytes32 valueKey, uint256 nextUpdateAt);
    error KeeperCannotMoveOffZero(bytes32 valueKey);
    error KeeperChangeTooLarge(bytes32 valueKey, uint256 oldValue, uint256 newValue);
    error InvalidKeeperGuardrails(uint256 maxChangeBps, uint256 cooldown);

    event KeeperChanged(address indexed previousKeeper, address indexed newKeeper);
    event KeeperGuardrailsChanged(uint256 keeperMaxChangeBps, uint256 keeperCooldown);

    modifier onlyByGovernorOrKeeper() {
        if (msg.sender != governor && msg.sender != keeper) revert GovernorOrKeeperOnly();
        _;
    }

    constructor(address keeper_) {
        keeper = keeper_;
        emit KeeperChanged(address(0), keeper_);
    }

    /// @notice Replaces the keeper; address(0) removes it.
    function changeKeeper(address newKeeper) external onlyByGovernor {
        emit KeeperChanged(keeper, newKeeper);
        keeper = newKeeper;
    }

    /// @notice Sets how far and how often the keeper may move an operating value: at most `BPS_DENOMINATOR`
    /// (100%) per update, and a cooldown of at most `MAX_KEEPER_COOLDOWN`.
    function changeKeeperGuardrails(uint256 maxChangeBps, uint256 cooldown) external onlyByGovernor {
        if (maxChangeBps > BPS_DENOMINATOR || cooldown > MAX_KEEPER_COOLDOWN) {
            revert InvalidKeeperGuardrails(maxChangeBps, cooldown);
        }
        keeperMaxChangeBps = maxChangeBps;
        keeperCooldown = cooldown;
        emit KeeperGuardrailsChanged(maxChangeBps, cooldown);
    }

    /// @dev Call from a `onlyByGovernorOrKeeper` setter before writing `newValue`.
    function _checkKeeperUpdate(bytes32 valueKey, uint256 oldValue, uint256 newValue) internal {
        if (msg.sender == governor) return;

        uint256 lastUpdate = keeperLastUpdate[valueKey];
        if (lastUpdate != 0 && block.timestamp < lastUpdate + keeperCooldown) {
            revert KeeperCooldownActive(valueKey, lastUpdate + keeperCooldown);
        }
        if (oldValue == 0) revert KeeperCannotMoveOffZero(valueKey);
        uint256 delta = newValue > oldValue ? newValue - oldValue : oldValue - newValue;
        // Same rule as `delta * BPS_DENOMINATOR > oldValue * keeperMaxChangeBps`, without overflow for any value.
        if (delta > Math.mulDiv(oldValue, keeperMaxChangeBps, BPS_DENOMINATOR)) {
            revert KeeperChangeTooLarge(valueKey, oldValue, newValue);
        }
        keeperLastUpdate[valueKey] = block.timestamp;
    }
}
