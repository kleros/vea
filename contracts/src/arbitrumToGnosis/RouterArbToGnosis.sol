// SPDX-License-Identifier: MIT

/// @custom:authors: [@shotaronowhere, @jaybuidl]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../canonical/gnosis-chain/IAMB.sol";
import "../canonical/arbitrum/IBridge.sol";
import "../canonical/arbitrum/IOutbox.sol";
import "../canonical/arbitrum/ISequencerInbox.sol";
import "../interfaces/routers/IRouterToL1.sol";
import "../interfaces/outboxes/IVeaOutboxOnL1.sol";
import "../interfaces/updaters/ISequencerDelayUpdatable.sol";

/// @dev Router from Arbitrum to Gnosis Chain.
/// Note: This contract is deployed on Ethereum.
contract RouterArbToGnosis is IRouterToL1 {
    // ************************************* //
    // *             Storage               * //
    // ************************************* //

    IBridge public immutable bridge; // The address of the Arbitrum bridge contract.
    IAMB public immutable amb; // The address of the AMB contract on Ethereum.
    address public immutable veaInboxArbToGnosis; // The address of the veaInbox on Arbitrum.
    address public immutable veaOutboxArbToGnosis; // The address of the veaOutbox on Gnosis Chain.

    uint256 public sequencerDelayLimit; // This is MaxTimeVariation.delaySeconds from the arbitrum sequencer inbox, it is the maximum seconds the sequencer can backdate L2 txns relative to the L1 clock.
    SequencerDelayLimitDecreaseRequest public sequencerDelayLimitDecreaseRequest; // Decreasing the sequencerDelayLimit requires a delay to avoid griefing by sequencer, so we keep track of the request here.

    struct SequencerDelayLimitDecreaseRequest {
        uint256 requestedsequencerDelayLimit;
        uint256 timestamp;
    }

    // ************************************* //
    // *              Events               * //
    // ************************************* //

    /// @dev Event emitted when a message is relayed to another Safe Bridge.
    /// @param _epoch The epoch of the batch requested to send.
    /// @param _ticketID The unique identifier provided by the underlying canonical bridge.
    event Routed(uint256 indexed _epoch, bytes32 _ticketID);

    /// @dev This event indicates a cross-chain message was sent to inform the veaOutbox of the sequencer limit value
    /// @param _ticketID The ticketID from the AMB of the cross-chain message.
    event sequencerDelayLimitSent(bytes32 _ticketID);

    /// @dev This event indicates the sequencer limit updated.
    /// @param _newsequencerDelayLimit The new maxL2StateSyncDelay.
    event sequencerDelayLimitUpdated(uint256 _newsequencerDelayLimit);

    /// @dev This event indicates that a request to decrease the sequencer limit has been made.
    /// @param _requestedsequencerDelayLimit The new sequencer limit requested.
    event sequencerDelayLimitDecreaseRequested(uint256 _requestedsequencerDelayLimit);

    /// @dev Constructor.
    /// @param _bridge The address of the arbitrum bridge contract on Ethereum.
    /// @param _amb The address of the AMB contract on Ethereum.
    /// @param _veaInboxArbToGnosis The vea inbox on Arbitrum.
    /// @param _veaOutboxArbToGnosis The vea outbox on Gnosis Chain.
    constructor(IBridge _bridge, IAMB _amb, address _veaInboxArbToGnosis, address _veaOutboxArbToGnosis) {
        bridge = _bridge;
        amb = _amb;
        veaInboxArbToGnosis = _veaInboxArbToGnosis;
        veaOutboxArbToGnosis = _veaOutboxArbToGnosis;
        (, , sequencerDelayLimit, ) = ISequencerInbox(bridge.sequencerInbox()).maxTimeVariation();
    }

    // ************************************* //
    // *        Parameter Updates          * //
    // ************************************* //

    /// @dev Update the sequencerDelayLimit. If decreasing, a delayed request is created for later execution.
    function updatesequencerDelayLimit() public {
        // the maximum asynchronous lag between the L2 and L1 clocks
        (, , uint256 newsequencerDelayLimit, ) = ISequencerInbox(bridge.sequencerInbox()).maxTimeVariation();

        if (newsequencerDelayLimit > sequencerDelayLimit) {
            // For sequencerDelayLimit / epochPeriod > timeoutEpochs, claims cannot be verified by the timeout period and the bridge will shutdown.
            sequencerDelayLimit = newsequencerDelayLimit;
            emit sequencerDelayLimitUpdated(newsequencerDelayLimit);
            sendsequencerDelayLimit();
        } else if (newsequencerDelayLimit < sequencerDelayLimit) {
            require(
                sequencerDelayLimitDecreaseRequest.timestamp == 0,
                "Sequencer limit decrease request already pending."
            );

            sequencerDelayLimitDecreaseRequest = SequencerDelayLimitDecreaseRequest({
                requestedsequencerDelayLimit: newsequencerDelayLimit,
                timestamp: block.timestamp
            });
            emit sequencerDelayLimitDecreaseRequested(newsequencerDelayLimit);
        }
    }

    /// @dev execute sequencerDelayLimitDecreaseRequest
    function executesequencerDelayLimitDecreaseRequest() external {
        require(sequencerDelayLimitDecreaseRequest.timestamp != 0, "No pending sequencer limit decrease request.");
        require(
            block.timestamp > sequencerDelayLimitDecreaseRequest.timestamp + sequencerDelayLimit,
            "Sequencer limit decrease request is still pending."
        );

        uint256 requestedsequencerDelayLimit = sequencerDelayLimitDecreaseRequest.requestedsequencerDelayLimit;
        delete sequencerDelayLimitDecreaseRequest;

        (, , uint256 currentsequencerDelayLimit, ) = ISequencerInbox(bridge.sequencerInbox()).maxTimeVariation();

        // check the request is still consistent with the arbiturm bridge
        if (currentsequencerDelayLimit == requestedsequencerDelayLimit) {
            sequencerDelayLimit = requestedsequencerDelayLimit;
            emit sequencerDelayLimitUpdated(requestedsequencerDelayLimit);
            sendsequencerDelayLimit();
        }
    }

    /// @dev Calculate the maxL2StateSyncDelay by reading from the Arbitrum Bridge
    function sendsequencerDelayLimit() internal {
        bytes memory data = abi.encodeCall(ISequencerDelayUpdatable.updateSequencerDelayLimit, sequencerDelayLimit);
        // Note: using maxGasPerTx here means the relaying txn on Gnosis will need to pass that (large) amount of gas, though almost all will be unused and refunded. This is preferred over hardcoding a gas limit.
        bytes32 ticketID = amb.requireToPassMessage(veaOutboxArbToGnosis, data, amb.maxGasPerTx());
        emit sequencerDelayLimitSent(ticketID);
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /// Note: Access restricted to arbitrum canonical bridge.
    /// @dev Resolves any challenge of the optimistic claim for '_epoch'.
    /// @param _epoch The epoch to verify.
    /// @param _stateroot The true batch merkle root for the epoch.
    /// @param _claim The claim associated with the epoch.
    function route(uint256 _epoch, bytes32 _stateroot, Claim calldata _claim) external {
        // Arbitrum -> Ethereum message sender authentication
        // docs: https://developer.arbitrum.io/arbos/l2-to-l1-messaging/
        // example: https://github.com/OffchainLabs/arbitrum-tutorials/blob/2c1b7d2db8f36efa496e35b561864c0f94123a5f/packages/greeter/contracts/ethereum/GreeterL1.sol#L50
        // example: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/dfef6a68ee18dbd2e1f5a099061a3b8a0e404485/contracts/crosschain/arbitrum/LibArbitrumL1.sol#L34
        // note: we use the bridge address as a source of truth for the activeOutbox address

        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInboxArbToGnosis, "veaInbox only.");

        // Ethereum -> Gnosis message passing with the AMB, the canonical Ethereum <-> Gnosis bridge.
        // https://docs.tokenbridge.net/amb-bridge/development-of-a-cross-chain-application/how-to-develop-xchain-apps-by-amb#receive-a-method-call-from-the-amb-bridge

        bytes memory data = abi.encodeCall(IVeaOutboxOnL1.resolveDisputedClaim, (_epoch, _stateroot, _claim));
        // Note: using maxGasPerTx here means the relaying txn on Gnosis will need to pass that (large) amount of gas, though almost all will be unused and refunded. This is preferred over hardcoding a gas limit.
        bytes32 ticketID = amb.requireToPassMessage(veaOutboxArbToGnosis, data, amb.maxGasPerTx());
        emit Routed(_epoch, ticketID);
    }
}
