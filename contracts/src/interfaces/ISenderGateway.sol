// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "./IVeaInbox.sol";

interface ISenderGateway {
    function veaInbox() external view returns (IVeaInbox);

    function receiverGateway() external view returns (address);
}
