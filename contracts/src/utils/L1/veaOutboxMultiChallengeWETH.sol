// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "../../interfaces/tokens/gnosis/IWETH.sol";

/// @dev Vea Inbox Calldata Optimization.
///      No function selector required, only fallback function.
contract veaOutboxMultiChallengeWETH {
    address public immutable veaOutboxOnL1;
    IWETH public immutable weth;
    uint256 public immutable deposit;

    constructor(address _veaOutboxOnL1, address _weth, uint256 _deposit) {
        veaOutboxOnL1 = _veaOutboxOnL1;
        weth = IWETH(_weth);
        require(weth.approve(_veaOutboxOnL1, type(uint256).max), "Failed WETH approve.");
        deposit = _deposit;
    }

    function multiChallenge(bytes[] calldata datas) external payable {
        require(weth.transferFrom(msg.sender, address(this), deposit), "Failed WETH transfer.");
        for (uint256 i; i < datas.length; i++) {
            veaOutboxOnL1.call(datas[i]);
        }
        uint256 balance = weth.balanceOf(address(this));
        if (balance > 0) weth.transfer(msg.sender, balance - 1);
    }
}
