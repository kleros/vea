// SPDX-License-Identifier: MIT

/**
 *  @authors: [@hrishibhat]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../../../canonical/arbitrum/IBridge.sol";

contract BridgeMock is IBridge {
    address public outbox;

    constructor(address _outbox) {
        outbox = _outbox;
    }

    function activeOutbox() external view returns (address _outbox) {
        return address(outbox);
    }
}
