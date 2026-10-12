// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

/// @title Governed
/// @dev Governor-only access control, after the kleros-v2 gateways. Adapters inherit only this contract.
abstract contract Governed {
    address public governor;

    error GovernorOnly();
    error ZeroGovernor();

    event GovernorChanged(address indexed previousGovernor, address indexed newGovernor);

    modifier onlyByGovernor() {
        if (msg.sender != governor) revert GovernorOnly();
        _;
    }

    constructor(address governor_) {
        if (governor_ == address(0)) revert ZeroGovernor();
        governor = governor_;
        emit GovernorChanged(address(0), governor_);
    }

    /// @notice Hands the contract over to a new governor. There is no zero governor: it would lock the
    /// contract, and on LayerZero contracts hand the OZ ownership to address(0) as well.
    function changeGovernor(address newGovernor) external onlyByGovernor {
        if (newGovernor == address(0)) revert ZeroGovernor();
        _setGovernor(newGovernor);
    }

    function _setGovernor(address newGovernor) internal virtual {
        emit GovernorChanged(governor, newGovernor);
        governor = newGovernor;
    }
}
