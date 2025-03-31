// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

/// @dev Vea Inbox Calldata Optimization.
///      No function selector required, only fallback function.
contract VeaOutboxMultiChallenge {
    address public immutable veaOutboxOnL1;
    uint256 public immutable deposit;

    constructor(address _veaOutboxOnL1, uint256 _deposit) {
        veaOutboxOnL1 = _veaOutboxOnL1;
        deposit = _deposit;
    }

    function multiChallenge(bytes[] calldata datas) external payable {
        for (uint256 i = 0; i < datas.length; i++) {
            veaOutboxOnL1.call{value: deposit}(datas[i]);
        }

        uint256 balance = address(this).balance;
        if (balance > 0) payable(msg.sender).send(balance - 1); // msg.sender responsible to accept eth
    }
}
