// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shotaronowhere, @jaybuidl]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

// import "../canonical/optimism/IInboxOpt.sol";
// TODO: implement Optimism messaging.
import "../canonical/arbitrum/IInbox.sol";
import "../canonical/arbitrum/IOutbox.sol";
import "./interfaces/IRouterArbToOpt.sol";
import "./interfaces/IVeaOutboxArbToOpt.sol";

/**
 * Router on Ethereum from Arbitrum to Optimism.
 */
contract RouterArbToOptimism is IRouterArbToOpt {
    // ************************************* //
    // *             Storage               * //
    // ************************************* //

    IInbox public immutable inboxOpt; // The address of the Optimism Inbox contract.
    IInbox public immutable inboxArb; // The address of the Optimism Inbox contract.
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
     * @param _inboxArb The address of the arbitrum inbox contract on Ethereum.
     * @param _inboxOpt The address of the optimism inbox contract on Ethereum.
     * @param _veaInbox The veaInbox on Arbitrum.
     * @param _veaOutbox The veaOutbox on Gnosis Chain.
     */
    constructor(IInbox _inboxArb, IInbox _inboxOpt, address _veaInbox, address _veaOutbox) {
        inboxArb = _inboxArb;
        inboxOpt = _inboxOpt;
        veaInbox = _veaInbox;
        veaOutbox = _veaOutbox;
    }

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param epoch The epoch to verify.
     * @param stateroot The true batch merkle root for the epoch.
     */
    function route(uint256 epoch, bytes32 stateroot) external {
        IBridge bridge = inboxArb.bridge();
        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInbox, "Sender only.");

        bytes memory data = abi.encodeCall(IVeaOutboxArbToOpt.resolveDisputedClaim, (epoch, stateroot));

        // TODO: Send message to Optimism.
    }
}
