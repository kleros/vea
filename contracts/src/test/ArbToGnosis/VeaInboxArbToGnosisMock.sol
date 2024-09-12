// SPDX-License-Identifier: MIT

/// @custom:authors: [@madhurMongia]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

import "../../arbitrumToGnosis/VeaInboxArbToGnosis.sol";
import "../../canonical/arbitrum/IArbSys.sol";
import "../../interfaces/routers/IRouterToGnosis.sol";

contract VeaInboxArbToGnosisMock is VeaInboxArbToGnosis {
    IArbSys public immutable mockArbSys;

    constructor(
        uint256 _epochPeriod,
        address _routerArbToGnosis,
        IArbSys _mockArbSys
    ) VeaInboxArbToGnosis(_epochPeriod, _routerArbToGnosis) {
        mockArbSys = _mockArbSys;
    }

    // Override sendSnapshot to use the mock ArbSys
    function sendSnapshot(uint256 _epoch, uint256 _gasLimit, Claim memory _claim) external override {
        unchecked {
            require(_epoch < block.timestamp / epochPeriod, "Can only send past epoch snapshot.");
        }

        bytes memory data = abi.encodeCall(IRouterToGnosis.route, (_epoch, snapshots[_epoch], _gasLimit, _claim));

        // Use the mock ArbSys instead of the constant ARB_SYS
        bytes32 ticketID = bytes32(mockArbSys.sendTxToL1(routerArbToGnosis, data));

        emit SnapshotSent(_epoch, ticketID);
    }
}
