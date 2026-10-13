// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Reporter} from "./Reporter.sol";
import {IAdapter} from "../interfaces/IAdapter.sol";

/// @title PaidReporter
/// @dev A reporter that pays bridge fees from a balance funded in advance. The surplus is withdrawn to the keeper.
abstract contract PaidReporter is Reporter {
    using SafeERC20 for IERC20;

    error NativeWithdrawFailed();

    event NativeWithdrawn(address indexed keeper, uint256 amount);
    event TokenWithdrawn(IERC20 indexed token, address indexed keeper, uint256 amount);

    /// @notice The fee `dispatchMessages` would pay now to send `ids` and `hashes` to `adapter` on `targetChainId`.
    /// @dev Reverts as the dispatch would when the target chain is not configured.
    /// @return token The token the fee is paid in; address(0) is the native token.
    /// @return amount The fee, in `token`.
    function quoteDispatch(
        uint256 targetChainId,
        IAdapter adapter,
        uint256[] memory ids,
        bytes32[] memory hashes
    ) public view virtual returns (address token, uint256 amount);

    /// @notice Sends `amount` of the native balance to the keeper.
    function withdrawNative(uint256 amount) external onlyByGovernorOrKeeper {
        address keeper_ = keeper;
        if (keeper_ == address(0)) revert KeeperNotSet();
        (bool success, ) = keeper_.call{value: amount}("");
        if (!success) revert NativeWithdrawFailed();
        emit NativeWithdrawn(keeper_, amount);
    }

    /// @notice Sends `amount` of `token` to the keeper.
    function withdrawToken(IERC20 token, uint256 amount) external onlyByGovernorOrKeeper {
        address keeper_ = keeper;
        if (keeper_ == address(0)) revert KeeperNotSet();
        token.safeTransfer(keeper_, amount);
        emit TokenWithdrawn(token, keeper_, amount);
    }

    receive() external payable {}
}
