// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "./IVeaOutbox.sol";

interface IReceiverGateway {
    function veaOutbox() external view returns (IVeaOutbox);

    function senderChainID() external view returns (uint256);

    function senderGateway() external view returns (address);
}
