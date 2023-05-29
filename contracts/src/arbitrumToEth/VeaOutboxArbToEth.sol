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
    uint256 internal immutable burn; // The amount of wei to burn. deposit / 2
    uint256 internal immutable depositPlusReward; // 2 * deposit - burn

    address internal constant BURN_ADDRESS = address(0); // address to send burned eth
    uint256 internal constant SLOT_TIME = 12; // Ethereum 12 second slot time

    uint256 public immutable epochPeriod; // Epochs mark the period between potential snapshots.
    uint256 public immutable challengePeriod; // Time window to challenge a claim.
    uint256 public immutable claimDelay; // Can only claim for epochs after this delay (seconds)

    uint256 public immutable timeoutEpochs; // The number of epochs without forward progress before the bridge is considered shutdown.
    uint256 public immutable maxMissingBlocks; // The maximum number of blocks that can be missing in a challenge period.

    bytes32 public stateRoot;
    uint256 public latestVerifiedEpoch;

    mapping(uint256 => bytes32) public claimHashes; // epoch => claim
    mapping(uint256 => bytes32) public relayed; // msgId/256 => packed replay bitmap, preferred over a simple boolean mapping to save 15k gas per message

    // ************************************* //
    // *              Events               * //
    // ************************************* //

    /// @dev Watcher check this event to challenge fraud.
    /// @param _claimer The address of the claimer.
    /// @param _stateRoot The state root of the claim.
    event Claimed(address indexed _claimer, bytes32 _stateRoot);

    /// @dev This event indicates that `sendSnapshot(epoch)` should be called in the inbox.
    /// @param _epoch The epoch associated with the challenged claim.
    /// @param _challenger The address of the challenger.
    event Challenged(uint256 _epoch, address indexed _challenger);

    /// @dev This event indicates that a message has been relayed.
    /// @param _msgId The msgId of the message that was relayed.
    event MessageRelayed(uint64 _msgId);

    /// @dev This events indicates that verification has succeeded. The messages are ready to be relayed.
    /// @param _epoch The epoch that was verified.
    event Verified(uint256 _epoch);

    // ************************************* //
    // *        Function Modifiers         * //
    // ************************************* //

    modifier OnlyBridgeRunning() {
        unchecked {
            require(block.timestamp / epochPeriod <= latestVerifiedEpoch + timeoutEpochs, "Bridge Shutdown.");
        }
        _;
    }

    modifier OnlyBridgeShutdown() {
        unchecked {
            require(block.timestamp / epochPeriod > latestVerifiedEpoch + timeoutEpochs, "Bridge Running.");
        }
        _;
    }

    /// @dev Constructor.
    /// Note: epochPeriod must match the VeaInboxArbToEth contract deployment on Arbitrum, since it's on a different chain, we can't read it and trust the deployer to set a correct value
    /// @param _deposit The deposit amount to submit a claim in wei.
    /// @param _epochPeriod The duration of each epoch.
    /// @param _challengePeriod The duration of the period allowing to challenge a claim.
    /// @param _timeoutEpochs The epochs before the bridge is considered shutdown.
    /// @param _veaInboxArbToEth The address of the inbox contract on Arbitrum.
    /// @param _bridge The address of the arbitrum bridge contract on Ethereum.
    /// @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _timeoutEpochs,
        address _veaInboxArbToEth,
        address _bridge,
        uint256 _maxMissingBlocks
    ) {
        // sanity check to prevent underflow the deployer should have set these correctly.
        require(0 < _epochPeriod && _epochPeriod <= block.timestamp, "Invalid epochPeriod.");

        deposit = _deposit;
        // epochPeriod must match the VeaInboxArbToEth contract deployment epochPeriod value.
        epochPeriod = _epochPeriod;
        challengePeriod = _challengePeriod;
        timeoutEpochs = _timeoutEpochs;
        veaInboxArbToEth = _veaInboxArbToEth;
        bridge = IBridge(_bridge);
        maxMissingBlocks = _maxMissingBlocks;

        ISequencerInbox sequencerInbox = ISequencerInbox(bridge.sequencerInbox());
        // the maximum asynchronous lag between the L2 and L1 clocks
        (, , uint256 arbitrumSequencerMaxDelaySeconds, ) = sequencerInbox.maxTimeVariation();

        // adding the epochPeriod for the time for a node to sync
        // in otherwords, this is the worst case time for an honest node to know the L2 state to claim / challenge
        claimDelay = arbitrumSequencerMaxDelaySeconds + 2 * epochPeriod;

        // sanity check to prevent underflow
        require(claimDelay <= block.timestamp, "Invalid claimDelay.");

        // claimant and challenger are not sybil resistant
        // must burn half deposit to prevent zero cost griefing
        burn = _deposit / 2;
        depositPlusReward = 2 * _deposit - burn;

        latestVerifiedEpoch = block.timestamp / epochPeriod - 1;
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
            require(block.timestamp / epochPeriod >= _epoch, "Epoch is in the future.");
            require((block.timestamp - claimDelay) / epochPeriod <= _epoch, "Epoch is too old.");
        }

        require(claimHashes[_epoch] == bytes32(0), "Claim already made.");

        claimHashes[_epoch] = hashClaim(
            Claim({
                stateRoot: _stateRoot,
                claimer: msg.sender,
                timestamp: uint32(0),
                blocknumber: uint32(0),
                honest: Party.None,
                challenger: address(0)
            })
        );

        emit Claimed(msg.sender, _stateRoot);
    }

    /// @dev Start verification for claim for 'epoch'.
    /// @param _epoch The epoch of the claim to challenge.
    /// @param _claim The claim associated with the epoch.
    function startClaimVerification(uint256 _epoch, Claim memory _claim) external payable virtual {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.timestamp == uint32(0), "Claim already challenged.");
        require((block.timestamp - claimDelay) / epochPeriod >= _epoch, "Epoch is too old.");

        _claim.timestamp = uint32(block.timestamp);
        _claim.blocknumber = uint32(block.number);
        claimHashes[_epoch] == hashClaim(_claim);
    }

    /// @dev Submit a challenge for the claim of the inbox state root snapshot taken at 'epoch'.
    /// @param _epoch The epoch of the claim to challenge.
    /// @param _claim The claim associated with the epoch.
    function challenge(uint256 _epoch, Claim memory _claim) external payable virtual {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.challenger == address(0), "Claim already challenged.");
        require(msg.value >= deposit, "Insufficient challenge deposit.");

        unchecked {
            require(_claim.honest == Party.None, "Claim already verified.");
        }

        _claim.challenger = msg.sender;
        claimHashes[_epoch] = hashClaim(_claim);

        emit Challenged(_epoch, msg.sender);
    }

    /// @dev Resolves the optimistic claim for '_epoch'.
    /// @param _epoch The epoch of the optimistic claim.
    /// @param _claim The claim associated with the epoch.
    function validateSnapshot(uint256 _epoch, Claim memory _claim) external virtual OnlyBridgeRunning {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");

        unchecked {
            require(_claim.timestamp != 0, "Claim verification not started.");
            require(_claim.timestamp + challengePeriod < block.timestamp, "Challenge period has not yet elapsed.");
            require(
                // expected blocks <= actual blocks + maxMissingBlocks
                uint256(_claim.blocknumber) + (block.timestamp - uint256(_claim.timestamp)) / SLOT_TIME <=
                    block.number + maxMissingBlocks,
                "Too many missing blocks. Possible censorship attack. Use canonical bridge."
            );
        }

        require(_claim.challenger == address(0), "Claim is challenged.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;
            if (_claim.stateRoot != bytes32(0)) {
                stateRoot = _claim.stateRoot;
            }
            emit Verified(_epoch);
        }

        _claim.honest = Party.Claimer;
        claimHashes[_epoch] = hashClaim(_claim);
    }

    /// Note: Access restricted to arbitrum  bridge.
    /// @dev Resolves any challenge of the optimistic claim for '_epoch'.
    /// @param _epoch The epoch to verify.
    /// @param _stateRoot The true state root for the epoch.
    /// @param _claim The claim associated with the epoch
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

        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInboxArbToEth, "veaInbox only.");

        if (_epoch > latestVerifiedEpoch && _stateRoot != bytes32(0)) {
            latestVerifiedEpoch = _epoch;
            stateRoot = _stateRoot;
            emit Verified(_epoch);
        }

        if (claimHashes[_epoch] == hashClaim(_claim) && _claim.honest == Party.None) {
            if (_claim.stateRoot == _stateRoot) {
                _claim.honest = Party.Claimer;
            } else if (_claim.challenger != address(0)) {
                _claim.honest = Party.Challenger;
            }
            claimHashes[_epoch] = hashClaim(_claim);
        }
    }

    /// @dev Verifies and relays the message. UNTRUSTED.
    /// @param _proof The merkle proof to prove the message.
    /// @param _msgId The zero based index of the message in the inbox.
    /// @param _to The address of the contract on Ethereum to call.
    /// @param _message The message encoded with header from VeaInbox.
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
                    _claim.timestamp,
                    _claim.blocknumber,
                    _claim.honest,
                    _claim.challenger
                )
            );
    }

    /// @dev Claim passed censorship test
    /// @param _claim The claim to test.
    /// @return testPassed True if the claim passed the censorship test.
    function passedTest(Claim calldata _claim) external view returns (bool testPassed) {
        uint256 expectedBlocks = uint256(_claim.blocknumber) +
            (block.timestamp - uint256(_claim.timestamp)) /
            SLOT_TIME;
        uint256 actualBlocks = block.number;
        testPassed = (expectedBlocks <= actualBlocks + maxMissingBlocks);
    }
}
