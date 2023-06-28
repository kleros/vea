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
import "../canonical/arbitrum/IInbox.sol";
import "../interfaces/routers/IRouterToArb.sol";
import "../interfaces/outboxes/IVeaOutboxOnL2.sol";
import "../canonical/arbitrum/ISequencerInbox.sol";
import "../interfaces/updaters/ISequencerDelayUpdatable.sol";
import "../interfaces/updaters/ISequencerFutureUpdatable.sol";

/// @dev Router from Gnosis Chain to Arbitrum.
/// Note: This contract is deployed on Ethereum.
contract RouterGnosisToArb is IRouterToArb {
    // ************************************* //
    // *             Storage               * //
    // ************************************* //

    IBridge public immutable bridge; // The address of the Arbitrum bridge contract.
    IAMB public immutable amb; // The address of the AMB contract on Ethereum.
    address public immutable veaInboxGnosisToArb; // The address of the veaInbox on Gnosis.
    address public immutable veaOutboxGnosisToArb; // The address of the veaOutbox on Arbitrum.
    uint256 internal immutable inboxChainId; // The chain ID of the inbox chain.

    mapping(address => uint256) public L2GasBalance;

    uint256 public sequencerDelayLimit; // This is MaxTimeVariation.delaySeconds from the arbitrum sequencer inbox, it is the maximum seconds the sequencer can backdate L2 txns relative to the L1 clock.
    uint256 public sequencerFutureLimit; // This is MaxTimeVariation.futureSeconds from the arbitrum sequencer inbox, it is the maximum seconds the sequencer can futuredate L2 txns relative to the L1 clock.
    SequencerLimitDecreaseRequest public sequencerDelayLimitDecreaseRequest; // Decreasing the sequencerDelayLimit requires a delay to avoid griefing by sequencer, so we keep track of the request here.
    SequencerLimitDecreaseRequest public sequencerFutureLimitDecreaseRequest; // Decreasing the sequencerDelayLimit requires a delay to avoid griefing by sequencer, so we keep track of the request here.

    struct SequencerLimitDecreaseRequest {
        uint256 requestedSequencerLimit;
        uint256 timestamp;
    }

    // ************************************* //
    // *              Events               * //
    // ************************************* //

    /// @dev Event emitted when a message is relayed to another Safe Bridge.
    /// @param _epoch The epoch of the batch requested to send.
    /// @param _ticketID The unique identifier provided by the underlying canonical bridge.
    event Routed(uint256 indexed _epoch, uint256 _ticketID);

    /// @dev This event indicates a cross-chain message was sent to inform the veaOutbox of the sequencer delay limit value
    /// @param _ticketID The ticketID from the delayed inbox of the cross-chain message.
    event sequencerDelayLimitSent(uint256 _ticketID);

    /// @dev This event indicates the sequencer delay limit updated.
    /// @param _newSequencerDelayLimit The new sequencer delay limit.
    event sequencerDelayLimitUpdated(uint256 _newSequencerDelayLimit);

    /// @dev This event indicates that a request to decrease the sequencer delay limit has been made.
    /// @param _requestedSequencerDelayLimit The new sequencer limit requested.
    event sequencerDelayLimitDecreaseRequested(uint256 _requestedSequencerDelayLimit);

    /// @dev This event indicates a cross-chain message was sent to inform the veaOutbox of the sequencer future limit value
    /// @param _ticketID The ticketID from the delayed inbox of the cross-chain message.
    event sequencerFutureLimitSent(uint256 _ticketID);

    /// @dev This event indicates the sequencer future limit updated.
    /// @param _newSequencerFutureLimit The new sequencer future limit.
    event sequencerFutureLimitUpdated(uint256 _newSequencerFutureLimit);

    /// @dev This event indicates that a request to decrease the sequencer future limit has been made.
    /// @param _requestedSequencerFutureLimit The new sequencer limit requested.
    event sequencerFutureLimitDecreaseRequested(uint256 _requestedSequencerFutureLimit);

    /// @dev Constructor.
    /// @param _bridge The address of the arbitrum bridge contract on Ethereum.
    /// @param _amb The address of the AMB contract on Ethereum.
    /// @param _veaInboxArbToGnosis The vea inbox on Arbitrum.
    /// @param _veaOutboxArbToGnosis The vea outbox on Gnosis Chain.
    /// @param _inboxChainId The chain ID of the inbox chain.
    constructor(
        IBridge _bridge,
        IAMB _amb,
        address _veaInboxArbToGnosis,
        address _veaOutboxArbToGnosis,
        uint256 _inboxChainId
    ) {
        bridge = _bridge;
        amb = _amb;
        veaInboxGnosisToArb = _veaInboxArbToGnosis;
        veaOutboxGnosisToArb = _veaOutboxArbToGnosis;
        inboxChainId = _inboxChainId;

        updateSequencerDelayLimit();
    }

    // ************************************* //
    // *        Parameter Updates          * //
    // ************************************* //

    /// @dev Update the sequencerDelayLimit. If decreasing, a delayed request is created for later execution.
    function updateSequencerDelayLimit() public {
        // the maximum asynchronous lag between the L2 and L1 clocks
        (, , uint256 newSequencerDelayLimit, ) = ISequencerInbox(bridge.sequencerInbox()).maxTimeVariation();

        if (newSequencerDelayLimit > sequencerDelayLimit) {
            // For sequencerDelayLimit / epochPeriod > timeoutEpochs, claims cannot be verified by the timeout period and the bridge will shutdown.
            sequencerDelayLimit = newSequencerDelayLimit;
            emit sequencerDelayLimitUpdated(newSequencerDelayLimit);
        } else if (newSequencerDelayLimit < sequencerDelayLimit) {
            require(
                sequencerDelayLimitDecreaseRequest.timestamp == 0,
                "Sequencer limit decrease request already pending."
            );

            sequencerDelayLimitDecreaseRequest = SequencerLimitDecreaseRequest({
                requestedSequencerLimit: newSequencerDelayLimit,
                timestamp: block.timestamp
            });
            emit sequencerDelayLimitDecreaseRequested(newSequencerDelayLimit);
        }
    }

    /// @dev Update the sequencerFutureLimit. If decreasing, a delayed request is created for later execution.
    function updateSequencerFutureLimit() public {
        // the maximum asynchronous lag between the L2 and L1 clocks
        (, , , uint256 newSequencerFutureLimit) = ISequencerInbox(bridge.sequencerInbox()).maxTimeVariation();

        if (newSequencerFutureLimit > sequencerFutureLimit) {
            // For sequencerFutureLimit / epochPeriod > timeoutEpochs, claims cannot be verified by the timeout period and the bridge will shutdown.
            sequencerFutureLimit = newSequencerFutureLimit;
            emit sequencerFutureLimitUpdated(newSequencerFutureLimit);
        } else if (newSequencerFutureLimit < sequencerFutureLimit) {
            require(
                sequencerFutureLimitDecreaseRequest.timestamp == 0,
                "Sequencer limit decrease request already pending."
            );

            sequencerFutureLimitDecreaseRequest = SequencerLimitDecreaseRequest({
                requestedSequencerLimit: newSequencerFutureLimit,
                timestamp: block.timestamp
            });
            emit sequencerFutureLimitDecreaseRequested(newSequencerFutureLimit);
        }
    }

    /// @dev execute sequencerDelayLimitDecreaseRequest
    function executeSequencerDelayLimitDecreaseRequest() external {
        require(sequencerDelayLimitDecreaseRequest.timestamp != 0, "No pending sequencer limit decrease request.");
        require(
            block.timestamp > sequencerDelayLimitDecreaseRequest.timestamp + sequencerDelayLimit,
            "Sequencer limit decrease request is still pending."
        );

        uint256 requestedSequencerDelayLimit = sequencerDelayLimitDecreaseRequest.requestedSequencerLimit;
        delete sequencerDelayLimitDecreaseRequest;

        (, , uint256 currentSequencerDelayLimit, ) = ISequencerInbox(bridge.sequencerInbox()).maxTimeVariation();

        // check the request is still consistent with the arbiturm bridge
        if (currentSequencerDelayLimit == requestedSequencerDelayLimit) {
            sequencerDelayLimit = requestedSequencerDelayLimit;
            emit sequencerDelayLimitUpdated(requestedSequencerDelayLimit);
        }
    }

    /// @dev execute sequencerFutureLimitDecreaseRequest
    function executeSequencerFutureLimitDecreaseRequest() external {
        require(sequencerFutureLimitDecreaseRequest.timestamp != 0, "No pending sequencer limit decrease request.");
        require(
            block.timestamp > sequencerFutureLimitDecreaseRequest.timestamp + sequencerFutureLimit,
            "Sequencer limit decrease request is still pending."
        );

        uint256 requestedSequencerFutureLimit = sequencerFutureLimitDecreaseRequest.requestedSequencerLimit;
        delete sequencerFutureLimitDecreaseRequest;

        (, , , uint256 currentSequencerFutureLimit) = ISequencerInbox(bridge.sequencerInbox()).maxTimeVariation();

        // check the request is still consistent with the arbiturm bridge
        if (currentSequencerFutureLimit == requestedSequencerFutureLimit) {
            sequencerFutureLimit = requestedSequencerFutureLimit;
            emit sequencerFutureLimitUpdated(requestedSequencerFutureLimit);
        }
    }

    /// @dev Send the sequencer future limit through the delayed inbox.
    function sendSequencerFutureLimit(
        uint256 _inboxIndex,
        uint256 _maxSubmissionCost,
        address _excessFeeRefundAddress,
        uint256 _gasLimit,
        uint256 _maxFeePerGas
    ) external {
        uint256 msgValue = _maxSubmissionCost + _gasLimit * _maxFeePerGas;
        uint256 gasBalance = L2GasBalance[msg.sender];

        require(gasBalance >= msgValue, "Insufficient L2 gas balance.");

        L2GasBalance[msg.sender] = gasBalance - msgValue;

        bytes memory data = abi.encodeCall(
            ISequencerFutureUpdatable.updateSequencerFutureLimit,
            (sequencerFutureLimit, block.timestamp)
        );

        uint256 ticketID = IInbox(bridge.allowedDelayedInboxList(_inboxIndex)).createRetryableTicket{value: msgValue}(
            veaOutboxGnosisToArb,
            0, // no callvalue
            _maxSubmissionCost,
            _excessFeeRefundAddress,
            address(0), // no callvalue to refund, no one can cancel the ticket
            _gasLimit,
            _maxFeePerGas,
            data
        );

        emit sequencerFutureLimitSent(ticketID);
    }

    /// @dev Send the sequencer delay limit through the delayed inbox.
    function sendSequencerDelayLimit(
        uint256 _inboxIndex,
        uint256 _maxSubmissionCost,
        address _excessFeeRefundAddress,
        uint256 _gasLimit,
        uint256 _maxFeePerGas
    ) external {
        uint256 msgValue = _maxSubmissionCost + _gasLimit * _maxFeePerGas;
        uint256 gasBalance = L2GasBalance[msg.sender];

        require(gasBalance >= msgValue, "Insufficient L2 gas balance.");

        L2GasBalance[msg.sender] = gasBalance - msgValue;

        bytes memory data = abi.encodeCall(
            ISequencerDelayUpdatable.updateSequencerDelayLimit,
            (sequencerDelayLimit, block.timestamp)
        );

        uint256 ticketID = IInbox(bridge.allowedDelayedInboxList(_inboxIndex)).createRetryableTicket{value: msgValue}(
            veaOutboxGnosisToArb,
            0, // no callvalue
            _maxSubmissionCost,
            _excessFeeRefundAddress,
            address(0), // no callvalue to refund, no one can cancel the ticket
            _gasLimit,
            _maxFeePerGas,
            data
        );

        emit sequencerDelayLimitSent(ticketID);
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    function deposit() external payable {
        L2GasBalance[msg.sender] += msg.value;
    }

    function withdraw(uint256 _amount) external {
        require(L2GasBalance[msg.sender] > _amount, "Insufficient balance.");
        L2GasBalance[msg.sender] -= _amount;
        payable(msg.sender).send(_amount); // User is responsible for accepting ETH.
    }

    /// Note: Access restricted to arbitrum canonical bridge.
    /// @dev Resolves any challenge of the optimistic claim for '_epoch'.
    /// @param _epoch The epoch to verify.
    /// @param _stateroot The true state root for the epoch.
    /// @param _inboxIndex The index of the inbox in the Arbitrum bridge contract.
    /// @param _maxSubmissionCost Max gas deducted from user's L2 balance to cover base submission fee.
    /// @param _excessFeeRefundAddress Address to refund any excess fee to.
    /// @param _gasLimit Max gas deducted from user's L2 balance to cover L2 execution. Should not be set to 1 (magic value used to trigger the RetryableData error).
    /// @param _maxFeePerGas price bid for L2 execution. Should not be set to 1 (magic value used to trigger the RetryableData error).
    function route(
        uint256 _epoch,
        bytes32 _stateroot,
        uint256 _inboxIndex,
        uint256 _maxSubmissionCost,
        address _excessFeeRefundAddress,
        uint256 _gasLimit,
        uint256 _maxFeePerGas
    ) external {
        // Ethereum -> Gnosis message authentication with the AMB, the canonical Ethereum <-> Gnosis bridge.
        // https://docs.tokenbridge.net/amb-bridge/development-of-a-cross-chain-application/how-to-develop-xchain-apps-by-amb#receive-a-method-call-from-the-amb-bridge

        require(msg.sender == address(amb), "Not from native Gnosis AMB bridge.");
        require(bytes32(inboxChainId) == amb.messageSourceChainId(), "Invalid chain id.");
        require(veaInboxGnosisToArb == amb.messageSender(), "Vea Inbox only.");

        // Ethereum -> Arbitrum message passing with retryable tickets in the delayed inbox, the canonical Ethereum -> Arbitrum bridge.
        // https://developer.arbitrum.io/arbos/l1-to-l2-messaging#submission

        uint256 msgValue = _maxSubmissionCost + _gasLimit * _maxFeePerGas;
        uint256 gasBalance = L2GasBalance[msg.sender];

        require(gasBalance >= msgValue, "Insufficient L2 gas balance.");

        L2GasBalance[msg.sender] = gasBalance - msgValue;

        bytes memory data = abi.encodeCall(IVeaOutboxOnL2.resolveDisputedClaim, (_epoch, _stateroot));

        uint256 ticketID = IInbox(bridge.allowedDelayedInboxList(_inboxIndex)).createRetryableTicket{value: msgValue}(
            veaOutboxGnosisToArb,
            0, // no callvalue
            _maxSubmissionCost,
            _excessFeeRefundAddress,
            address(0), // no callvalue to refund, no one can cancel the ticket
            _gasLimit,
            _maxFeePerGas,
            data
        );

        emit Routed(_epoch, ticketID);
    }
}
