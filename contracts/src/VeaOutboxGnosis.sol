// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "./canonical/gnosis-chain/IAMB.sol";
import "./interfaces/IVeaOutbox.sol";

/**
 * Vea Bridge Outbox On Gnosis Chain
 */
contract VeaOutboxGnosis is IVeaOutbox {
    struct Claim {
        bytes32 stateRoot;
        address bridger;
        uint64 timestamp;
        bool honest;
        bool depositAndRewardWithdrawn;
    }

    struct Challenge {
        address challenger;
        bool honest;
        bool depositAndRewardWithdrawn;
    }

    IAMB public immutable amb; // The address of the AMB contract on Ethereum.
    uint256 public immutable deposit; // The deposit required to submit a claim or challenge
    uint64 public immutable numEpochTimeout; // The number unresolved epochs before the bridge is considered to be timed out
    uint64 public immutable epochClaimWindow; // The number of epochs a claim can be submitted for
    uint64 public immutable epochPeriod; // Epochs mark the period between potential batches of messages.
    uint64 public immutable challengePeriod; // Claim challenge timewindow.
    address public immutable router; // The address of the veaInbox on ethereum.

    bytes32 public stateRoot;
    uint64 public latestVerifiedEpoch;
    address public messageSender;

    mapping(uint64 => Claim) public claims; // epoch => claim
    mapping(uint64 => Challenge) public challenges; // epoch => challenge
    mapping(uint64 => bytes32) public relayed; // nonce/256 => packed replay bitmap

    /**
     * @dev The Fast Bridge participants watch for these events to decide if a challenge should be submitted.
     * @param epoch The epoch for which the the claim was made.
     * @param claimedStateRoot The claimed state root of the batched messages.
     */
    event Claimed(uint64 indexed epoch, bytes32 claimedStateRoot);

    /**
     * @dev This event indicates that `sendSafeFallback()` should be called on the sending side.
     * @param epoch The epoch associated with the challenged claim.
     */
    event Challenged(uint64 indexed epoch);

    /**
     * @dev This events indicates that optimistic verification has succeeded. The messages are ready to be relayed.
     * @param epoch The epoch associated with the batch.
     */
    event Verified(uint64 indexed epoch);

    /**
     * @dev This event indicates that the claim deposit has been withdrawn.
     * @param epoch The epoch associated with the batch.
     * @param bridger The recipient of the claim deposit.
     */
    event ClaimDepositWithdrawn(uint64 indexed epoch, address indexed bridger);

    /**
     * @dev This event indicates that the claim deposit has been withdrawn.
     * @param epoch The epoch associated with the batch.
     * @param bridger The recipient of the claim deposit.
     */
    event ClaimDepositWithdrawnTimeout(uint64 indexed epoch, address indexed bridger);

    /**
     * @dev This event indicates that the challenge deposit has been withdrawn.
     * @param epoch The epoch associated with the batch.
     * @param challenger The recipient of the challenge deposit.
     */
    event ChallengeDepositWithdrawn(uint64 indexed epoch, address indexed challenger);

    /**
     * @dev This event indicates that the challenge deposit has been withdrawn.
     * @param epoch The epoch associated with the batch.
     * @param challenger The recipient of the challenge deposit.
     */
    event ChallengeDepositWithdrawnTimeout(uint64 indexed epoch, address indexed challenger);

    /**
     * @dev This event indicates that a message has been relayed for the batch in this `_epoch`.
     * @param nonce The nonce of the message that was relayed.
     */
    event MessageRelayed(uint64 indexed nonce);

    /**
     * @dev Constructor.
     * @param _deposit The deposit amount to submit a claim in wei.
     * @param _epochPeriod The duration of each epoch.
     * @param _challengePeriod The duration of the period allowing to challenge a claim.
     * @param _numEpochTimeout The number of epochs after which the bridge is considered to be frozen.
     * @param _epochClaimWindow The number of epochs a claim can be submitted for.
     * @param _router The address of the inbox contract on Ethereum.
     * @param _amb The address of the AMB contract.
     */
    constructor(
        uint256 _deposit,
        uint64 _epochPeriod,
        uint64 _challengePeriod,
        uint64 _numEpochTimeout,
        uint64 _epochClaimWindow,
        address _router,
        address _veaInbox,
        address _amb
    ) {
        deposit = _deposit;
        epochPeriod = _epochPeriod;
        challengePeriod = _challengePeriod;
        numEpochTimeout = _numEpochTimeout;
        epochClaimWindow = _epochClaimWindow;
        router = _router;
        amb = IAMB(_amb);
        latestVerifiedEpoch = uint64(block.timestamp) / epochPeriod - 1;
        // default value instead of zero, to save on storage refunds
        messageSender = address(type(uint160).max);
    }

    modifier OnlyBridgeRunning() {
        require(uint64(block.timestamp) / epochPeriod < latestVerifiedEpoch + numEpochTimeout, "Bridge Shutdown.");
        _;
    }

    modifier OnlyBridgeShutdown() {
        require(uint64(block.timestamp) / epochPeriod > latestVerifiedEpoch + numEpochTimeout, "Bridge Running.");
        _;
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /**
     * @dev Submit a claim about the the _stateRoot at _epoch and submit a deposit.
     * @param _epoch The epoch for which the claim is made.
     * @param _stateRoot The state root to claim.
     */
    function claim(uint64 _epoch, bytes32 _stateRoot) external payable OnlyBridgeRunning {
        require(msg.value >= deposit, "Insufficient claim deposit.");
        uint64 epochNow = uint64(block.timestamp) / epochPeriod;
        require(_epoch >= epochNow - epochClaimWindow && _epoch <= epochNow, "Invalid epoch.");
        require(_stateRoot != bytes32(0), "Invalid claim.");
        require(claims[_epoch].bridger == address(0), "Claim already made.");

        claims[_epoch] = Claim({
            stateRoot: _stateRoot,
            bridger: msg.sender,
            timestamp: uint64(block.timestamp),
            honest: false,
            depositAndRewardWithdrawn: false
        });
        emit Claimed(_epoch, _stateRoot);
    }

    /**
     * @dev Submit a challenge for the claim of the current epoch's Fast Bridge batch merkleroot state and submit a deposit. The `batchMerkleRoot` in the claim already made for the last finalized epoch should be different from the one on the sending side, otherwise the sender will lose his deposit.
     * @param _epoch The epoch of the claim to challenge.
     */
    function challenge(uint64 _epoch) external payable {
        require(msg.value >= deposit, "Not enough claim deposit");

        // Can only challenge the only active claim, about the previous epoch
        require(claims[_epoch].bridger != address(0), "No claim to challenge.");
        require(challenges[_epoch].challenger == address(0), "Claim already challenged.");
        require(block.timestamp < uint256(claims[_epoch].timestamp) + challengePeriod, "Challenge period elapsed.");

        challenges[_epoch] = Challenge({challenger: msg.sender, honest: false, depositAndRewardWithdrawn: false});

        emit Challenged(_epoch);
    }

    /**
     * @dev Resolves the optimistic claim for '_epoch'.
     * @param _epoch The epoch of the optimistic claim.
     */
    function verifyStateroot(uint64 _epoch) external {
        Claim storage claim = claims[_epoch];
        require(claim.bridger != address(0), "Invalid epoch, no claim to verify.");
        require(block.timestamp > uint64(claim.timestamp) + challengePeriod, "Challenge period has not yet elapsed.");
        require(challenges[_epoch].challenger == address(0), "Claim is challenged.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;
            stateRoot = claim.stateRoot;
        }

        claim.honest = true;

        emit Verified(_epoch);
    }

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param _epoch The epoch to verify.
     * @param _stateRoot The true state root for the epoch.
     */
    function resolveChallenge(uint64 _epoch, bytes32 _stateRoot) external virtual {
        require(msg.sender == address(amb), "Not from bridge.");
        require(amb.messageSender() == router, "Not from router.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;
            stateRoot = _stateRoot;
        }

        Claim storage claim = claims[_epoch];
        Challenge storage challenge = challenges[_epoch];

        if (claim.bridger != address(0) && claim.stateRoot == _stateRoot) {
            claim.honest = true;
        } else if (challenge.challenger != address(0)) {
            challenge.honest = true;
        }

        emit Verified(_epoch);
    }

    /**
     * @dev Verifies and relays the message.
     * @param proof The merkle proof to prove the message.
     * @param index The index of the message in the merkle tree.
     * @param msgSender The address of the message sender.
     * @param to The address of the message receiver.
     * @param data The data of the message.
     */
    function verifyAndRelayMessage(
        bytes32[] calldata proof,
        uint64 index,
        address msgSender,
        address to,
        bytes calldata data
    ) external {
        // double hashed leaf

        bytes32 msgHash = keccak256(abi.encodePacked(keccak256(abi.encode(index, msgSender, to, data))));

        require(stateRoot == calculateRoot(proof, msgHash), "Invalid proof.");

        uint64 relayIndex = index / 256;
        uint64 offset = index % 256;
        bytes32 replay = relayed[relayIndex];
        require(((replay >> offset) & bytes32(uint256(1))) == bytes32(0), "Message already relayed");
        relayed[relayIndex] = replay | bytes32(1 << offset);

        address oldMessageSender = messageSender;
        messageSender = msgSender;

        (bool success, ) = to.call(data);
        require(success, "Failed to call contract");

        messageSender = oldMessageSender;

        emit MessageRelayed(index);
    }

    /**
     * @dev Sends the deposit back to the Bridger if their claim is not successfully challenged. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
     * @param _epoch The epoch associated with the claim deposit to withraw.
     */
    function withdrawClaimDeposit(uint64 _epoch) external {
        Claim storage claim = claims[_epoch];

        require(claim.bridger != address(0), "Claim does not exist");
        require(claim.honest == true, "Claim failed.");
        require(claim.depositAndRewardWithdrawn == false, "Claim deposit and any rewards already withdrawn.");

        claim.depositAndRewardWithdrawn = true;

        uint256 amount = deposit;

        if (challenges[_epoch].challenger != address(0)) {
            uint256 burn = deposit / 2;
            amount += deposit - burn;
            payable(address(0x000000000000000000000000000000000000dEaD)).send(burn); // half burnt
        }

        address bridger = claim.bridger;
        payable(bridger).send(amount); // Use of send to prevent reverting fallback. User is responsibility for accepting ETH.
        // Checks-Effects-Interaction

        emit ClaimDepositWithdrawn(_epoch, bridger);
    }

    /**
     * @dev Sends the deposit back to the Challenger if their challenge is successful. Includes a portion of the Bridger's deposit.
     * @param _epoch The epoch associated with the challenge deposit to withraw.
     */
    function withdrawChallengeDeposit(uint64 _epoch) external {
        Challenge storage challenge = challenges[_epoch];

        require(challenge.challenger != address(0), "Challenge does not exist");
        require(challenge.honest == true, "Challenge failed.");
        require(challenge.depositAndRewardWithdrawn == false, "Challenge deposit and rewards already withdrawn.");

        challenge.depositAndRewardWithdrawn = true;

        uint256 burn = deposit / 2;
        payable(address(0x000000000000000000000000000000000000dEaD)).send(burn); // half burnt

        uint256 amount = deposit + deposit - burn;
        address challenger = challenge.challenger;
        payable(challenger).send(amount - burn); // Use of send to prevent reverting fallback. User is responsibility for accepting ETH.

        emit ChallengeDepositWithdrawn(_epoch, challenger);
        // Checks-Effects-Interaction
    }

    /**
     * @dev Sends the deposit back to the Bridger if their claim is not successfully challenged. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
     * @param _epoch The epoch associated with the claim deposit to withraw.
     */
    function withdrawClaimDepositTimeout(uint64 _epoch) external OnlyBridgeShutdown {
        require(_epoch > latestVerifiedEpoch, "Claim not made in timeout period");

        Claim storage claim = claims[_epoch];

        require(claim.bridger != address(0), "Claim does not exist");

        address bridger = claim.bridger;
        delete claims[_epoch];

        payable(bridger).send(deposit); // Use of send to prevent reverting fallback. User is responsibility for accepting ETH.
        // Checks-Effects-Interaction

        emit ClaimDepositWithdrawnTimeout(_epoch, claim.bridger);
    }

    /**
     * @dev Sends the deposit back to the Challenger if their challenge is successful. Includes a portion of the Bridger's deposit.
     * @param _epoch The epoch associated with the challenge deposit to withraw.
     */
    function withdrawChallengeDepositTimeout(uint64 _epoch) external OnlyBridgeShutdown {
        require(_epoch > latestVerifiedEpoch, "Claim not made in timeout period");

        Challenge storage challenge = challenges[_epoch];

        require(challenge.challenger != address(0), "Challenge does not exist");

        address challenger = challenge.challenger;
        delete challenges[_epoch];

        payable(challenger).send(deposit); // Use of send to prevent reverting fallback. User is responsibility for accepting ETH.

        emit ChallengeDepositWithdrawnTimeout(_epoch, challenger);
        // Checks-Effects-Interaction
    }

    /**
     * @dev Calculates merkle root from proof.
     * @param proof The merkle proof.
     * @param leaf The leaf to validate membership in merkle tree.
     */
    function calculateRoot(bytes32[] memory proof, bytes32 leaf) internal pure returns (bytes32) {
        uint256 proofLength = proof.length;
        require(proofLength < 64, "Invalid Proof");
        bytes32 h = leaf;
        for (uint256 i = 0; i < proofLength; i++) {
            bytes32 proofElement = proof[i];
            if (proofElement > h)
                assembly {
                    mstore(0x00, h)
                    mstore(0x20, proofElement)
                    h := keccak256(0x00, 0x40)
                }
            else
                assembly {
                    mstore(0x00, proofElement)
                    mstore(0x20, h)
                    h := keccak256(0x00, 0x40)
                }
        }
        return h;
    }
}
