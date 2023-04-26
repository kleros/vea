// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "./IVeaOutbox.sol";

interface IReceiverGateway {
    function veaOutbox() external view returns (IVeaOutbox);

    function senderGateway() external view returns (address);
}
