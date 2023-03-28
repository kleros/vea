// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere, @jaybuidl]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "./canonical/gnosis-chain/IAMB.sol";
import "./canonical/arbitrum/IInbox.sol";
import "./canonical/arbitrum/IOutbox.sol";
import "./interfaces/IVeaOutbox.sol";

/**
 * Router on Ethereum from Arbitrum to Gnosis Chain.
 */
contract RouterGC {
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
     * @param _ticketID The unique identifier provided by the underlying canonical bridge.
     */
    event Routed(uint256 indexed _epoch, bytes32 _ticketID);

    /**
     * @dev Constructor.
     * @param _inbox The address of the inbox contract on Ethereum.
     * @param _amb The address of the AMB contract on Ethereum.
     * @param _sender The safe bridge sender on Arbitrum.
     * @param _receiver The fast bridge receiver on Gnosis Chain.
     */
    constructor(
        IInbox _inbox,
        IAMB _amb,
        address _sender,
        address _receiver
    ) {
        inbox = _inbox;
        amb = _amb;
        sender = _sender;
        receiver = _receiver;
    }

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param _epoch The epoch to verify.
     * @param _stateroot The true batch merkle root for the epoch.
     */
    function resolveChallenge(uint256 _epoch, bytes32 _stateroot) external {
        IBridge bridge = inbox.bridge();
        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == sender, "Sender only.");

        bytes memory _data = abi.encodeWithSelector(IVeaOutbox.resolveChallenge.selector, _epoch, _stateroot);

        // replace maxGasPerTx with safe level for production deployment
        bytes32 ticketID = amb.requireToPassMessage(receiver, _data, amb.maxGasPerTx());
        emit Routed(_epoch, ticketID);
    }
}
