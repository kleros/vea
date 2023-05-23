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
import "../canonical/arbitrum/IBridge.sol";
import "../canonical/arbitrum/IOutbox.sol";
import "../interfaces/routers/IRouterToL1.sol";
import "../interfaces/outboxes/IVeaOutboxOnL1.sol";

/**
 * Router from Arbitrum to Gnosis Chain.
 * Note: This contract is deployed on Ethereum.
 */
contract RouterArbToGnosis is IRouterToL1 {
    // ************************************* //
    // *             Storage               * //
    // ************************************* //

    IBridge public immutable bridge; // The address of the Arbitrum bridge contract.
    IAMB public immutable amb; // The address of the AMB contract on Ethereum.
    address public immutable veaInboxArbToGnosis; // The address of the veaInbox on Arbitrum.
    address public immutable veaOutboxArbToGnosis; // The address of the veaOutbox on Gnosis Chain.

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
     * @param _amb The address of the AMB contract on Ethereum.
     * @param _veaInboxArbToGnosis The vea inbox on Arbitrum.
     * @param _veaOutboxArbToGnosis The vea outbox on Gnosis Chain.
     */
    constructor(IBridge _bridge, IAMB _amb, address _veaInboxArbToGnosis, address _veaOutboxArbToGnosis) {
        bridge = _bridge;
        amb = _amb;
        veaInboxArbToGnosis = _veaInboxArbToGnosis;
        veaOutboxArbToGnosis = _veaOutboxArbToGnosis;
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param epoch The epoch to verify.
     * @param stateroot The true batch merkle root for the epoch.
     */
    function route(uint256 epoch, bytes32 stateroot, Claim calldata claim) external {
        // Arbitrum -> Ethereum message sender authentication
        // docs: https://developer.arbitrum.io/arbos/l2-to-l1-messaging/
        // example: https://github.com/OffchainLabs/arbitrum-tutorials/blob/2c1b7d2db8f36efa496e35b561864c0f94123a5f/packages/greeter/contracts/ethereum/GreeterL1.sol#L50
        // example: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/dfef6a68ee18dbd2e1f5a099061a3b8a0e404485/contracts/crosschain/arbitrum/LibArbitrumL1.sol#L34
        // note: we use the bridge address as a source of truth for the activeOutbox address

        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInboxArbToGnosis, "veaInbox only.");

        // Ethereum -> Gnosis message passing with the AMB, the canonical Ethereum <-> Gnosis bridge.
        // https://docs.tokenbridge.net/amb-bridge/development-of-a-cross-chain-application/how-to-develop-xchain-apps-by-amb#receive-a-method-call-from-the-amb-bridge

        bytes memory data = abi.encodeCall(IVeaOutboxOnL1.resolveDisputedClaim, (epoch, stateroot, claim));
        // Note: using maxGasPerTx here means the relaying txn on Gnosis will need to pass that (large) amount of gas, though almost all will be unused and refunded. This is preferred over hardcoding a gas limit.
        bytes32 ticketID = amb.requireToPassMessage(veaOutboxArbToGnosis, data, amb.maxGasPerTx());
        emit Routed(epoch, ticketID);
    }
}
