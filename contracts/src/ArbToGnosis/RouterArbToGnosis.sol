// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere, @jaybuidl]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../canonical/gnosis-chain/IAMB.sol";
import "../canonical/arbitrum/IInbox.sol";
import "../canonical/arbitrum/IOutbox.sol";
import "../interfaces/IRouter.sol";
import "../interfaces/IVeaOutbox.sol";

/**
 * Router on Ethereum from Arbitrum to Gnosis Chain.
 */
contract RouterArbToGnosis is IRouter {
    // ************************************* //
    // *             Storage               * //
    // ************************************* //

    IInbox public immutable inbox; // The address of the Arbitrum Inbox contract.
    IAMB public immutable amb; // The address of the AMB contract on Ethereum.
    address public immutable sender; // The address of the sender on Arbitrum.
    address public immutable receiver; // The address of the Receiver on Gnosis Chain.

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
     * @param _sender The safe bridge sender on Arbitrum.
     * @param _receiver The fast bridge receiver on Gnosis Chain.
     */
    constructor(IInbox _inbox, IAMB _amb, address _sender, address _receiver) {
        inbox = _inbox;
        amb = _amb;
        sender = _sender;
        receiver = _receiver;
    }

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param epoch The epoch to verify.
     * @param stateroot The true batch merkle root for the epoch.
     */
    function route(uint256 epoch, bytes32 stateroot) external {
        IBridge bridge = inbox.bridge();
        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == sender, "Sender only.");

        bytes memory data = abi.encodeWithSelector(IVeaOutbox.resolveDisputedClaim.selector, epoch, stateroot);

        // replace maxGasPerTx with safe level for production deployment
        bytes32 ticketID = amb.requireToPassMessage(receiver, data, amb.maxGasPerTx());
        emit Routed(epoch, ticketID);
    }

    // TODO Route heartbeat
}
