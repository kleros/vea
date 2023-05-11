// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere, @jaybuidl]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../canonical/gnosis-chain/IAMB.sol";
import "../canonical/arbitrum/IInbox.sol";
import "../canonical/arbitrum/IOutbox.sol";
import "./interfaces/IRouterArbToGnosis.sol";
import "./interfaces/IVeaOutboxArbToGnosis.sol";

/**
 * Router on Ethereum from Arbitrum to Gnosis Chain.
 */
contract RouterArbToGnosis is IRouterArbToGnosis {
    // ************************************* //
    // *             Storage               * //
    // ************************************* //

    IInbox public immutable inbox; // The address of the Arbitrum Inbox contract.
    IAMB public immutable amb; // The address of the AMB contract on Ethereum.
    address public immutable veaInbox; // The address of the veaInbox on Arbitrum.
    address public immutable veaOutbox; // The address of the veaOutbox on Gnosis Chain.

    // ************************************* //
    // *              Events               * //
    // ************************************* //

    /**
     * @dev Event emitted when a message is relayed to another Safe Bridge.
     * @param epoch The epoch of the batch requested to send.
     * @param ticketID The unique identifier provided by the underlying canonical bridge.
     */
    event Routed(uint256 indexed epoch, bytes32 ticketID);

    /**
     * @dev Constructor.
     * @param _inbox The address of the inbox contract on Ethereum.
     * @param _amb The address of the AMB contract on Ethereum.
     * @param _veaInbox The veaInbox on Arbitrum.
     * @param _veaOutbox The veaOutbox on Gnosis Chain.
     */
    constructor(IInbox _inbox, IAMB _amb, address _veaInbox, address _veaOutbox) {
        inbox = _inbox;
        amb = _amb;
        veaInbox = _veaInbox;
        veaOutbox = _veaOutbox;
    }

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param epoch The epoch to verify.
     * @param stateroot The true batch merkle root for the epoch.
     */
    function route(uint256 epoch, bytes32 stateroot, IVeaOutboxArbToGnosis.Claim calldata claim) external {
        IBridge bridge = inbox.bridge();
        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInbox, "veaInbox only.");

        bytes memory data = abi.encodeCall(IVeaOutboxArbToGnosis.resolveDisputedClaim, (epoch, stateroot, claim));

        // replace maxGasPerTx with reasonable level for production deployment
        bytes32 ticketID = amb.requireToPassMessage(veaOutbox, data, amb.maxGasPerTx());
        emit Routed(epoch, ticketID);
    }
}
