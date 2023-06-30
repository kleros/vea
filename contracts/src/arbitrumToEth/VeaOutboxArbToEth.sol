// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../canonical/arbitrum/ISequencerInbox.sol";
import "../canonical/arbitrum/IBridge.sol";
import "../canonical/arbitrum/IOutbox.sol";
import "../interfaces/outboxes/IVeaOutboxOnL1.sol";

/// @dev Vea Outbox From Arbitrum to Ethereum.
/// Note: This contract is deployed on Ethereum.
contract VeaOutboxArbToEth is IVeaOutboxOnL1 {
    // ************************************* //
    // *             Storage               * //
    // ************************************* //

    IBridge public immutable bridge; // The address of the Arbitrum bridge contract.
    address public immutable veaInboxArbToEth; // The address of the vea inbox on arbitrum.

    uint256 public immutable deposit; // The deposit in wei required to submit a claim or challenge
    uint256 public immutable burn; // The amount of wei to burn. deposit / 2
    uint256 public immutable depositPlusReward; // 2 * deposit - burn

    address public constant BURN_ADDRESS = address(0); // Address to send burned eth
    uint256 internal constant SLOT_TIME = 12; // Ethereum 12 second slot time

    uint256 public immutable epochPeriod; // Epochs mark the period between potential snapshots.
    uint256 public immutable minChallengePeriod; // Minimum time window to challenge a claim, even with a malicious sequencer.

    uint256 public immutable timeoutEpochs; // The number of epochs without forward progress before the bridge is considered shutdown.
    uint256 public immutable maxMissingBlocks; // The maximum number of blocks that can be missing in a challenge period.

    bytes32 public stateRoot; // merkle root of the outbox state
    uint256 public latestVerifiedEpoch; // The latest epoch that has been verified.

    mapping(uint256 => bytes32) public claimHashes; // epoch => claim
    mapping(uint256 => bytes32) internal relayed; // msgId/256 => packed replay bitmap, preferred over a simple boolean mapping to save 15k gas per message

    uint256 public sequencerDelayLimit; // This is MaxTimeVariation.delaySeconds from the arbitrum sequencer inbox, it is the maximum seconds the sequencer can backdate L2 txns relative to the L1 clock.
    SequencerDelayLimitDecreaseRequest public sequencerDelayLimitDecreaseRequest; // Decreasing the sequencerDelayLimit requires a delay to avoid griefing by sequencer, so we keep track of the request here.

    struct SequencerDelayLimitDecreaseRequest {
        uint256 requestedsequencerDelayLimit;
        uint256 timestamp;
    }

    enum CensorshipTestStatus {
        Failed,
        Passed,
        NotStarted,
        InProgress
    }

    // ************************************* //
    // *              Events               * //
    // ************************************* //

    /// @dev Watchers check this event to challenge fraud.
    /// @param _claimer The address of the claimer.
    /// @param _epoch The epoch associated with the claim.
    /// @param _stateRoot The state root of the claim.
    event Claimed(address indexed _claimer, uint256 indexed _epoch, bytes32 _stateRoot);

    /// @dev This event indicates that `sendSnapshot(epoch)` should be called in the inbox.
    /// @param _epoch The epoch associated with the challenged claim.
    /// @param _challenger The address of the challenger.
    event Challenged(uint256 _epoch, address indexed _challenger);

    /// @dev This event indicates that a message has been relayed.
    /// @param _msgId The msgId of the message that was relayed.
    event MessageRelayed(uint64 _msgId);

    /// @dev This event indicates that the censorship test started and all challengers are ready even in the worst case scenario of a malicious sequencer.
    /// @param _epoch The epoch that started verification.
    event VerificationStarted(uint256 _epoch);

    /// @dev This events indicates that verification has succeeded. The messages are ready to be relayed.
    /// @param _epoch The epoch that was verified.
    event Verified(uint256 _epoch);

    /// @dev This event indicates the sequencer limit updated.
    /// @param _newSequencerDelayLimit The new sequencer delay limit.
    event sequencerDelayLimitUpdated(uint256 _newSequencerDelayLimit);

    /// @dev This event indicates that a request to decrease the sequencer limit has been made.
    /// @param _requestedSequencerDelayLimit The new sequencer delay limit requested.
    event sequencerDelayLimitDecreaseRequested(uint256 _requestedSequencerDelayLimit);

    // ************************************* //
    // *        Function Modifiers         * //
    // ************************************* //

    modifier OnlyBridgeRunning() {
        unchecked {
            require(block.timestamp / epochPeriod - latestVerifiedEpoch <= timeoutEpochs, "Bridge Shutdown.");
        }
        _;
    }

    modifier OnlyBridgeShutdown() {
        unchecked {
            require(block.timestamp / epochPeriod - latestVerifiedEpoch > timeoutEpochs, "Bridge Running.");
        }
        _;
    }

    /// @dev Constructor.
    /// Note: epochPeriod must match the VeaInboxArbToEth contract deployment on Arbitrum, since it's on a different chain, we can't read it and trust the deployer to set a correct value
    /// @param _deposit The deposit amount to submit a claim in wei.
    /// @param _epochPeriod The duration of each epoch.
    /// @param _minChallengePeriod The minimum time window to challenge a claim.
    /// @param _timeoutEpochs The epochs before the bridge is considered shutdown.
    /// @param _veaInboxArbToEth The address of the inbox contract on Arbitrum.
    /// @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _minChallengePeriod,
        uint256 _timeoutEpochs,
        address _veaInboxArbToEth,
        address _bridge,
        uint256 _maxMissingBlocks
    ) {
        deposit = _deposit;
        // epochPeriod must match the VeaInboxArbToEth contract deployment epochPeriod value.
        epochPeriod = _epochPeriod;
        minChallengePeriod = _minChallengePeriod;
        timeoutEpochs = _timeoutEpochs;
        veaInboxArbToEth = _veaInboxArbToEth;
        bridge = IBridge(_bridge);
        maxMissingBlocks = _maxMissingBlocks;

        updateSequencerDelayLimit();

        // claimant and challenger are not sybil resistant
        // must burn half deposit to prevent zero cost griefing
        burn = _deposit / 2;
        depositPlusReward = 2 * _deposit - burn;

        latestVerifiedEpoch = block.timestamp / epochPeriod - 1;
    }

    // ************************************* //
    // *        Parameter Updates          * //
    // ************************************* //

    /// @dev Request to decrease the sequencerDelayLimit.
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

            sequencerDelayLimitDecreaseRequest = SequencerDelayLimitDecreaseRequest({
                requestedsequencerDelayLimit: newSequencerDelayLimit,
                timestamp: block.timestamp
            });

            emit sequencerDelayLimitDecreaseRequested(newSequencerDelayLimit);
        }
    }

    /// @dev execute sequencerDelayLimitDecreaseRequest
    function executeSequencerDelayLimitDecreaseRequest() external {
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
        }
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /// @dev Submit a claim about the _stateRoot at _epoch and submit a deposit.
    /// @param _epoch The epoch for which the claim is made.
    /// @param _stateRoot The state root to claim.
    function claim(uint256 _epoch, bytes32 _stateRoot) external payable virtual {
        require(msg.value >= deposit, "Insufficient claim deposit.");
        unchecked {
            require(_epoch == block.timestamp / epochPeriod - 1, "Epoch has not yet passed.");
        }
        require(_stateRoot != bytes32(0), "Invalid claim.");
        require(claimHashes[_epoch] == bytes32(0), "Claim already made.");

        claimHashes[_epoch] = hashClaim(
            Claim({
                stateRoot: _stateRoot,
                claimer: msg.sender,
                timestampClaimed: uint32(block.timestamp),
                timestampVerification: uint32(0),
                blocknumberVerification: uint32(0),
                honest: Party.None,
                challenger: address(0)
            })
        );

        emit Claimed(msg.sender, _epoch, _stateRoot);

        // Refund overpayment.
        if (msg.value > deposit) {
            uint256 refund = msg.value - deposit;
            payable(msg.sender).send(refund); // User is responsible for accepting ETH.
        }
    }

    /// @dev Submit a challenge for the claim of the inbox state root snapshot taken at 'epoch'.
    /// @param _epoch The epoch of the claim to challenge.
    /// @param _claim The claim associated with the epoch.
    function challenge(uint256 _epoch, Claim memory _claim) external payable {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(msg.value >= deposit, "Insufficient challenge deposit.");
        require(_claim.challenger == address(0), "Claim already challenged.");
        require(_claim.honest == Party.None, "Claim already verified.");

        _claim.challenger = msg.sender;
        claimHashes[_epoch] = hashClaim(_claim);

        emit Challenged(_epoch, msg.sender);

        // Refund overpayment.
        if (msg.value > deposit) {
            uint256 refund = msg.value - deposit;
            payable(msg.sender).send(refund); // User is responsible for accepting ETH.
        }
    }

    /// @dev Start verification for claim for 'epoch'.
    /// @param _epoch The epoch of the claim to challenge.
    /// @param _claim The claim associated with the epoch.
    function startVerification(uint256 _epoch, Claim memory _claim) external virtual {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");

        // sequencerDelayLimit + epochPeriod is the worst case time to sync the L2 state compared to L1 clock.
        // using checked arithmetic incase arbitrum governance sets sequencerDelayLimit to a large value
        require(
            block.timestamp - uint256(_claim.timestampClaimed) >= sequencerDelayLimit + epochPeriod,
            "Claim must wait atleast maxL2StateSyncDelay."
        );

        CensorshipTestStatus _censorshipTestStatus = censorshipTestStatus(_claim);
        require(
            _censorshipTestStatus == CensorshipTestStatus.NotStarted ||
                _censorshipTestStatus == CensorshipTestStatus.Failed,
            "Claim verification in progress or already completed."
        );

        _claim.timestampVerification = uint32(block.timestamp);
        _claim.blocknumberVerification = uint32(block.number);

        claimHashes[_epoch] = hashClaim(_claim);

        emit VerificationStarted(_epoch);
    }

    /// @dev Resolves the optimistic claim for '_epoch'.
    /// @param _epoch The epoch of the optimistic claim.
    /// @param _claim The claim associated with the epoch.
    function verifySnapshot(uint256 _epoch, Claim memory _claim) external virtual OnlyBridgeRunning {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.challenger == address(0), "Claim is challenged.");
        require(censorshipTestStatus(_claim) == CensorshipTestStatus.Passed, "Censorship test not passed.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;
            stateRoot = _claim.stateRoot;
            emit Verified(_epoch);
        }

        _claim.honest = Party.Claimer;
        claimHashes[_epoch] = hashClaim(_claim);
    }

    /// Note: Access restricted to arbitrum  bridge.
    /// @dev Resolves any challenge of the optimistic claim for '_epoch'.
    /// @param _epoch The epoch to verify.
    /// @param _stateRoot The true state root for the epoch.
    /// @param _claim The claim associated with the epoch.
    function resolveDisputedClaim(
        uint256 _epoch,
        bytes32 _stateRoot,
        Claim memory _claim
    ) external virtual OnlyBridgeRunning {
        // Arbitrum -> Ethereum message sender authentication
        // docs: https://developer.arbitrum.io/arbos/l2-to-l1-messaging/
        // example: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/dfef6a68ee18dbd2e1f5a099061a3b8a0e404485/contracts/crosschain/arbitrum/LibArbitrumL1.sol#L34
        // example: https://github.com/OffchainLabs/arbitrum-tutorials/blob/2c1b7d2db8f36efa496e35b561864c0f94123a5f/packages/greeter/contracts/ethereum/GreeterL1.sol#L50
        // note: we call the bridge for the activeOutbox address

        require(msg.sender == address(bridge), "Not from native arbitrum bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInboxArbToEth, "veaInboxArbToEth only.");

        if (_epoch > latestVerifiedEpoch && _stateRoot != bytes32(0)) {
            latestVerifiedEpoch = _epoch;
            stateRoot = _stateRoot;
            emit Verified(_epoch);
        }

        if (claimHashes[_epoch] == hashClaim(_claim)) {
            if (_claim.stateRoot == _stateRoot) {
                _claim.honest = Party.Claimer;
            } else if (_claim.challenger != address(0)) {
                _claim.honest = Party.Challenger;
            }
            claimHashes[_epoch] = hashClaim(_claim);
        }
    }

    /// @dev Verifies and relays the message. UNTRUSTED.
    /// @param _proof The merkle proof to prove the message inclusion in the inbox state root.
    /// @param _msgId The zero based index of the message in the inbox.
    /// @param _to The address of the contract on Ethereum to call.
    /// @param _message The message encoded in the vea inbox as abi.encodeWithSelector(fnSelector, msg.sender, param1, param2, ...)
    function sendMessage(bytes32[] calldata _proof, uint64 _msgId, address _to, bytes calldata _message) external {
        require(_proof.length < 64, "Proof too long.");

        bytes32 nodeHash = keccak256(abi.encodePacked(_msgId, _to, _message));

        // double hashed leaf
        // avoids second order preimage attacks
        // https://flawed.net.nz/2018/02/21/attacking-merkle-trees-with-a-second-preimage-attack/
        assembly {
            mstore(0x00, nodeHash)
            nodeHash := keccak256(0x00, 0x20)
        }

        unchecked {
            for (uint256 i = 0; i < _proof.length; i++) {
                bytes32 proofElement = _proof[i];
                // sort sibling hashes as a convention for efficient proof validation
                if (proofElement > nodeHash)
                    assembly {
                        mstore(0x00, nodeHash)
                        mstore(0x20, proofElement)
                        nodeHash := keccak256(0x00, 0x40)
                    }
                else
                    assembly {
                        mstore(0x00, proofElement)
                        mstore(0x20, nodeHash)
                        nodeHash := keccak256(0x00, 0x40)
                    }
            }
        }

        require(stateRoot == nodeHash, "Invalid proof.");

        // msgId is the zero-based index of the message in the inbox.
        // msgId is also used as an index in the relayed bitmap to prevent replay.
        // Note: a bitmap is used instead of a simple boolean mapping to save 15k gas per message.

        uint256 relayIndex = _msgId >> 8;
        uint256 offset;

        unchecked {
            offset = _msgId % 256;
        }

        bytes32 replay = relayed[relayIndex];

        require(((replay >> offset) & bytes32(uint256(1))) == bytes32(0), "Message already relayed");
        relayed[relayIndex] = replay | bytes32(1 << offset);

        // UNTRUSTED.
        (bool success, ) = _to.call(_message);
        require(success, "Failed to call contract");

        emit MessageRelayed(_msgId);
    }

    /// @dev Sends the deposit back to the Claimer if successful. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
    /// @param _epoch The epoch associated with the claim deposit to withraw.
    /// @param _claim The claim associated with the epoch.
    function withdrawClaimDeposit(uint256 _epoch, Claim calldata _claim) external virtual {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.honest == Party.Claimer, "Claim failed.");

        delete claimHashes[_epoch];

        if (_claim.challenger != address(0)) {
            payable(BURN_ADDRESS).send(burn);
            payable(_claim.claimer).send(depositPlusReward); // User is responsible for accepting ETH.
        } else {
            payable(_claim.claimer).send(deposit); // User is responsible for accepting ETH.
        }
    }

    /// @dev Sends the deposit back to the Challenger if successful. Includes a portion of the Bridger's deposit.
    /// @param _epoch The epoch associated with the challenge deposit to withraw.
    /// @param _claim The claim associated with the epoch.
    function withdrawChallengeDeposit(uint256 _epoch, Claim calldata _claim) external {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.honest == Party.Challenger, "Challenge failed.");

        delete claimHashes[_epoch];

        payable(BURN_ADDRESS).send(burn); // half burnt
        payable(_claim.challenger).send(depositPlusReward); // User is responsible for accepting ETH.
    }

    /// @dev When bridge is shutdown, no claim disputes can be resolved. This allows the claimer to withdraw their deposit.
    /// @param _epoch The epoch associated with the claim deposit to withraw.
    /// @param _claim The claim associated with the epoch.
    function withdrawClaimerEscapeHatch(uint256 _epoch, Claim memory _claim) external OnlyBridgeShutdown {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.honest == Party.None, "Claim resolved.");

        if (_claim.claimer != address(0)) {
            if (_claim.challenger == address(0)) {
                delete claimHashes[_epoch];
                payable(_claim.claimer).send(deposit); // User is responsible for accepting ETH.
            } else {
                address claimer = _claim.claimer;
                _claim.claimer = address(0);
                claimHashes[_epoch] == hashClaim(_claim);
                payable(claimer).send(deposit); // User is responsible for accepting ETH.
            }
        }
    }

    /// @dev When bridge is shutdown, no claim disputes can be resolved. This allows the challenger to withdraw their deposit.
    /// @param _epoch The epoch associated with the claim deposit to withraw.
    /// @param _claim The claim associated with the epoch.
    function withdrawChallengerEscapeHatch(uint256 _epoch, Claim memory _claim) external OnlyBridgeShutdown {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.honest == Party.None, "Claim resolved.");

        if (_claim.challenger != address(0)) {
            if (_claim.claimer == address(0)) {
                delete claimHashes[_epoch];
                payable(_claim.challenger).send(deposit); // User is responsible for accepting ETH.
            } else {
                address challenger = _claim.challenger;
                _claim.challenger = address(0);
                claimHashes[_epoch] == hashClaim(_claim);
                payable(challenger).send(deposit); // User is responsible for accepting ETH.
            }
        }
    }

    // ************************************* //
    // *           Pure / Views            * //
    // ************************************* //

    /// @dev Hashes the claim.
    /// @param _claim The claim to hash.
    /// @return hashedClaim The hash of the claim.
    function hashClaim(Claim memory _claim) public pure returns (bytes32 hashedClaim) {
        return
            hashedClaim = keccak256(
                abi.encodePacked(
                    _claim.stateRoot,
                    _claim.claimer,
                    _claim.timestampClaimed,
                    _claim.timestampVerification,
                    _claim.blocknumberVerification,
                    _claim.honest,
                    _claim.challenger
                )
            );
    }

    /// @dev Gets the status of the censorship test for claim.
    /// @param _claim The claim to test.
    /// @return status True if the claim passed the censorship test.
    function censorshipTestStatus(Claim memory _claim) public view returns (CensorshipTestStatus status) {
        unchecked {
            if (uint256(_claim.timestampVerification) == 0) {
                status = CensorshipTestStatus.NotStarted;
            } else if (block.timestamp - uint256(_claim.timestampVerification) < minChallengePeriod) {
                status = CensorshipTestStatus.InProgress;
            } else {
                uint256 expectedBlocks = uint256(_claim.blocknumberVerification) +
                    (block.timestamp - uint256(_claim.timestampVerification)) /
                    SLOT_TIME;
                uint256 actualBlocks = block.number;
                if (expectedBlocks - actualBlocks <= maxMissingBlocks) {
                    status = CensorshipTestStatus.Passed;
                } else {
                    status = CensorshipTestStatus.Failed;
                }
            }
        }
    }

    /// @dev Get the current epoch from the outbox's point of view using the Ethereum L1 clock.
    /// @return epoch The hash of the claim.
    function epochNow() external view returns (uint256 epoch) {
        epoch = block.timestamp / epochPeriod;
    }

    /// @dev Get the current epoch from the outbox's point of view using the Ethereum L1 clock.
    /// @return epoch The hash of the claim.
    function epochAt(uint256 timestamp) external view returns (uint256 epoch) {
        epoch = timestamp / epochPeriod;
    }

    /// @dev Get the msg relayed status.
    /// @param _msgId The msgId to check.
    /// @return isRelayed True if the msg was relayed.
    function isMsgRelayed(uint256 _msgId) external view returns (bool isRelayed) {
        uint256 relayIndex = _msgId >> 8;
        uint256 offset;

        unchecked {
            offset = _msgId % 256;
        }

        bytes32 replay = relayed[relayIndex];

        isRelayed = (replay >> offset) & bytes32(uint256(1)) == bytes32(uint256(1));
    }
}
