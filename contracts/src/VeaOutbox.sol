// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "./canonical/arbitrum/IInbox.sol";
import "./canonical/arbitrum/IOutbox.sol";
import "./interfaces/IVeaOutbox.sol";

/**
 * Vea Bridge Outbox On L1 Ethereum
 */
contract VeaOutbox is IVeaOutbox {
    struct Claim {
        bytes32 stateroot;
        address bridger;
        uint32 timestamp;
        bool honest;
        bool depositAndRewardWithdrawn;
    }

    struct Challenge {
        address challenger;
        bool honest;
        bool depositAndRewardWithdrawn;
    }

    IInbox public immutable inbox; // The address of the Arbitrum Inbox contract.
    uint256 public immutable deposit; // The deposit required to submit a claim or challenge
    uint256 public immutable numEpochTimeout; // The number unresolved epochs before the bridge is considered to be timed out
    uint256 public immutable epochClaimWindow; // The number of epochs a claim can be submitted for
    uint256 public immutable epochPeriod; // Epochs mark the period between potential batches of messages.
    uint256 public immutable challengePeriod; // Claim challenge timewindow.
    address public immutable veaInbox; // The address of the veaInbox on ethereum.

    bytes32 public stateRoot;
    uint256 public latestVerifiedEpoch;

    mapping(uint256 => Claim) public claims; // epoch => claim
    mapping(uint256 => Challenge) public challenges; // epoch => challenge
    mapping(uint256 => bytes32) public relayed; // nonce/256 => packed replay bitmap

    /**
     * @dev The Fast Bridge participants watch for these events to decide if a challenge should be submitted.
     * @param _epoch The epoch for which the the claim was made.
     * @param _batchMerkleRoot The timestamp of the claim creation.
     */
    event Claimed(uint256 indexed _epoch, bytes32 _batchMerkleRoot);

    /**
     * @dev This event indicates that `sendSafeFallback()` should be called on the sending side.
     * @param _epoch The epoch associated with the challenged claim.
     */
    event Challenged(uint256 indexed _epoch);

    /**
     * @dev This events indicates that optimistic verification has succeeded. The messages are ready to be relayed.
     * @param _epoch The epoch associated with the batch.
     */
    event Verified(uint256 indexed _epoch);

    /**
     * @dev This event indicates that the claim deposit has been withdrawn.
     * @param _epoch The epoch associated with the batch.
     * @param _bridger The recipient of the claim deposit.
     */
    event ClaimDepositWithdrawn(uint256 indexed _epoch, address indexed _bridger);

    /**
     * @dev This event indicates that the claim deposit has been withdrawn.
     * @param _epoch The epoch associated with the batch.
     * @param _bridger The recipient of the claim deposit.
     */
    event ClaimDepositWithdrawnTimeout(uint256 indexed _epoch, address indexed _bridger);

    /**
     * @dev This event indicates that the challenge deposit has been withdrawn.
     * @param _epoch The epoch associated with the batch.
     * @param _challenger The recipient of the challenge deposit.
     */
    event ChallengeDepositWithdrawn(uint256 indexed _epoch, address indexed _challenger);

    /**
     * @dev This event indicates that the challenge deposit has been withdrawn.
     * @param _epoch The epoch associated with the batch.
     * @param _challenger The recipient of the challenge deposit.
     */
    event ChallengeDepositWithdrawnTimeout(uint256 indexed _epoch, address indexed _challenger);

    /**
     * @dev This event indicates that a message has been relayed for the batch in this `_epoch`.
     * @param _nonce The nonce of the message that was relayed.
     */
    event MessageRelayed(uint256 indexed _nonce);

    /**
     * @dev Constructor.
     * @param _deposit The deposit amount to submit a claim in wei.
     * @param _epochPeriod The duration of each epoch.
     * @param _challengePeriod The duration of the period allowing to challenge a claim.
     * @param _numEpochTimeout The number of epochs after which the bridge is considered to be frozen.
     * @param _epochClaimWindow The number of epochs a claim can be submitted for.
     * @param _veaInbox The address of the inbox contract on Ethereum.
     * @param _inbox The address of the inbox contract on Ethereum.
     */
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _numEpochTimeout,
        uint256 _epochClaimWindow,
        address _veaInbox,
        address _inbox
    ) {
        deposit = _deposit;
        epochPeriod = _epochPeriod;
        challengePeriod = _challengePeriod;
        numEpochTimeout = _numEpochTimeout;
        epochClaimWindow = _epochClaimWindow;
        veaInbox = _veaInbox;
        inbox = IInbox(_inbox);
        latestVerifiedEpoch = block.timestamp / epochPeriod - 1;
    }

    modifier NotFrozen() {
        require(block.timestamp / epochPeriod < latestVerifiedEpoch + numEpochTimeout, "Bridge Frozen");
        _;
    }

    modifier Frozen() {
        require(block.timestamp / epochPeriod > latestVerifiedEpoch + numEpochTimeout, "Bridge Not Frozen");
        _;
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /**
     * @dev Submit a claim about the the _stateroot at _epoch and submit a deposit.
     * @param _stateroot The state root to claim.
     */
    function claim(uint256 _epochClaim, bytes32 _stateroot) external payable NotFrozen {
        require(msg.value >= deposit, "Insufficient claim deposit.");
        uint256 epoch = block.timestamp / epochPeriod;
        require(_epochClaim <= epoch && _epochClaim + epochClaimWindow >= epoch, "Invalid epoch.");
        require(_stateroot != bytes32(0), "Invalid claim.");
        require(claims[_epochClaim].bridger == address(0), "Claim already made.");

        claims[_epochClaim] = Claim({
            stateroot: _stateroot,
            bridger: msg.sender,
            timestamp: uint32(block.timestamp),
            honest: false,
            depositAndRewardWithdrawn: false
        });
        emit Claimed(_epochClaim, _stateroot);
    }

    /**
     * @dev Submit a challenge for the claim of the current epoch's Fast Bridge batch merkleroot state and submit a deposit. The `batchMerkleRoot` in the claim already made for the last finalized epoch should be different from the one on the sending side, otherwise the sender will lose his deposit.
     * @param _epoch The epoch of the claim to challenge.
     */
    function challenge(uint256 _epoch) external payable {
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
    function verifyStateroot(uint256 _epoch) external {
        Claim storage claim = claims[_epoch];
        require(claim.bridger != address(0), "Invalid epoch, no claim to verify.");
        require(
            block.timestamp > uint256(claims[_epoch].timestamp) + challengePeriod,
            "Challenge period has not yet elapsed."
        );
        require(challenges[_epoch].challenger == address(0), "Claim is challenged.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;
            stateRoot = claim.stateroot;
        }
        claim.honest = true;

        emit Verified(_epoch);
    }

    /**
     * Note: Access restricted to arbitrum canonical bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param _epoch The epoch to verify.
     * @param _stateRoot The true batch merkle root for the epoch.
     */
    function resolveChallenge(uint256 _epoch, bytes32 _stateRoot) external virtual {
        IBridge bridge = inbox.bridge();
        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInbox, "Sender only.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;
            stateRoot = _stateRoot;
        }

        if (claims[_epoch].bridger != address(0)) {
            if (_stateRoot == claims[_epoch].stateroot) {
                claims[_epoch].honest = true;
            } else {
                challenges[_epoch].honest = true;
            }
        }

        emit Verified(_epoch);
    }

    /**
     * @dev Verifies and relays the message.
     * @param _proof The merkle proof to prove the message.
     * @param _message The data of the message.
     */
    function verifyAndRelayMessage(bytes32[] calldata _proof, bytes calldata _message) external {
        bytes32 singleHash = keccak256(_message);
        bytes32 msgHash; // double hashed
        assembly {
            // efficient hash
            mstore(0x00, singleHash)
            mstore(0x20, singleHash)
            msgHash := keccak256(0x00, 0x40)
        }
        require(stateRoot == calculateRoot(_proof, msgHash), "Invalid proof.");

        (uint256 nonce, address receiver, bytes memory data) = abi.decode(_message, (uint256, address, bytes));

        uint256 index = nonce / 256;
        uint256 offset = nonce % 256;
        bytes32 replay = relayed[index];
        require(((replay >> offset) & bytes32(uint256(1))) == bytes32(0), "Message already relayed");
        relayed[index] = replay | bytes32(1 << offset);
        (bool success, ) = receiver.call(data);

        require(success, "Failed to call contract");
        emit MessageRelayed(nonce);
    }

    /**
     * @dev Sends the deposit back to the Bridger if their claim is not successfully challenged. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
     * @param _epoch The epoch associated with the claim deposit to withraw.
     */
    function withdrawClaimDeposit(uint256 _epoch) external {
        Claim storage claim = claims[_epoch];

        require(claim.bridger != address(0), "Claim does not exist");
        require(claim.honest == true, "Claim failed.");
        require(claim.depositAndRewardWithdrawn == false, "Claim deposit and any rewards already withdrawn.");

        claim.depositAndRewardWithdrawn = true;

        uint256 amount = deposit;

        if (challenges[_epoch].challenger != address(0)) {
            uint256 burn = deposit / 2;
            amount += deposit - burn;
            payable(address(0xdEad)).send(burn); // half burnt
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
    function withdrawChallengeDeposit(uint256 _epoch) external {
        Challenge storage challenge = challenges[_epoch];

        require(challenge.challenger != address(0), "Challenge does not exist");
        require(challenge.honest == true, "Challenge failed.");
        require(challenge.depositAndRewardWithdrawn == false, "Challenge deposit and rewards already withdrawn.");

        challenge.depositAndRewardWithdrawn = true;

        uint256 burn = deposit / 2;
        payable(address(0xdEad)).send(burn); // half burnt

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
    function withdrawClaimDepositTimeout(uint256 _epoch) external Frozen {
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
    function withdrawChallengeDepositTimeout(uint256 _epoch) external Frozen {
        require(_epoch > latestVerifiedEpoch, "Claim not made in timeout period");

        Challenge storage challenge = challenges[_epoch];

        require(challenge.challenger != address(0), "Challenge does not exist");

        address challenger = challenge.challenger;
        delete challenges[_epoch];

        payable(challenger).send(deposit); // Use of send to prevent reverting fallback. User is responsibility for accepting ETH.

        emit ChallengeDepositWithdrawnTimeout(_epoch, challenger);
        // Checks-Effects-Interaction
    }

    // ********************************** //
    // *         Merkle Proof           * //
    // ********************************** //

    /**
     * @dev Calculates merkle root from proof.
     * @param proof The merkle proof.
     * @param leaf The leaf to validate membership in merkle tree.
     */
    function calculateRoot(bytes32[] memory proof, bytes32 leaf) private pure returns (bytes32) {
        uint256 proofLength = proof.length;
        require(proofLength <= 32, "Invalid Proof");
        bytes32 h = leaf;
        for (uint256 i = 0; i < proofLength; i++) {
            bytes32 proofElement = proof[i];
            // effecient hash
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
