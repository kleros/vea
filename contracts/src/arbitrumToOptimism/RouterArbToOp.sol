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
import "../canonical/arbitrum/IBridge.sol";
import "../canonical/arbitrum/IOutbox.sol";
import "../interfaces/routers/IRouterToL2.sol";
import "../interfaces/outboxes/IVeaOutboxOnL2.sol";

/**
 * Router on Ethereum from Arbitrum to Optimism.
 */
contract RouterArbToOptimism is IRouterToL2 {
    // ************************************* //
    // *             Storage               * //
    // ************************************* //

    //IInbox public immutable inboxOpt; // The address of the Optimism Inbox contract.
    IBridge public immutable bridge; // The address of the Arbitrum bridge contract.
    address public immutable veaInbox; // The address of the veaInbox on Arbitrum.
    address public immutable veaOutbox; // The address of the veaOutbox on Optimism.

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
     * @param _bridge The address of the arbitrum bridge contract on Ethereum.
     * @param _veaInbox The veaInbox on Arbitrum.
     * @param _veaOutbox The veaOutbox on Gnosis Chain.
     * //param _inboxOpt The address of the optimism inbox contract on Ethereum.
     */
    constructor(IBridge _bridge, address _veaInbox, address _veaOutbox) {
        //IInbox _inboxOpt)}
        bridge = _bridge;
        veaInbox = _veaInbox;
        veaOutbox = _veaOutbox;
        //inboxOpt = _inboxOpt;
    }

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param epoch The epoch to verify.
     * @param stateroot The true batch merkle root for the epoch.
     */
    function route(uint256 epoch, bytes32 stateroot) external {
        require(msg.sender == address(bridge), "Not from bridge.");

        // L2 -> L1 message sender authentication
        // docs: https://developer.arbitrum.io/arbos/l2-to-l1-messaging/
        // examples:
        // https://github.com/OffchainLabs/arbitrum-tutorials/blob/2c1b7d2db8f36efa496e35b561864c0f94123a5f/packages/greeter/contracts/ethereum/GreeterL1.sol#L50
        // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/dfef6a68ee18dbd2e1f5a099061a3b8a0e404485/contracts/crosschain/arbitrum/LibArbitrumL1.sol#L34

        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInbox, "veaInbox only.");

        bytes memory data = abi.encodeCall(IVeaOutboxOnL2.resolveDisputedClaim, (epoch, stateroot));

        // TODO: Send message to Optimism.
    }
}
