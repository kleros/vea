// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../canonical/gnosis-chain/IAMB.sol";
import "../interfaces/IVeaOutbox.sol";

/**
 * Vea Bridge Outbox From Arbitrum to Gnosis.
 */
contract VeaOutboxArbToGnosis is IVeaOutbox {
    struct Claim {
        bytes32 stateRoot;
        address bridger;
        uint32 timestamp;
        uint32 blocknumber;
        bool honest;
    }

    struct Challenge {
        address challenger;
        bool honest;
    }

    struct VeaOutboxInfo {
        uint32 latestVerifiedEpoch;
        uint32 latestHeartbeatTimestamp;
    }

    IAMB public immutable amb; // The address of the AMB contract on Ethereum.
    address public immutable router; // The address of the router from Arbitrum to Gnosis on ethereum.

    uint256 public immutable deposit; // The deposit required to submit a claim or challenge
    uint256 public immutable burn; // The amount of wei to burn. deposit / 2
    uint256 public immutable depositPlusReward; // 2 * deposit - burn
    uint256 public immutable depositMinusOne; // deposit - 1
    address public constant burnAddress = address(0x0000000000000000000000000000000000000000);

    uint256 public immutable epochPeriod; // Epochs mark the period between potential batches of messages.
    uint256 public immutable challengePeriod; // Claim challenge timewindow.
    uint256 public immutable epochClaimWindow; // The number of past epochs a claim can be submitted for. eg 1 => 2 epoch claims possible epochNow, epochNow - 1
    uint256 public immutable timeout; // The seconds before the bridge is considered shutdown.
    uint256 public immutable maxMissingBlocks; // The maximum number of blocks that can be missing in a challenge period.

    bytes32 public stateRoot;
    VeaOutboxInfo public veaOutboxInfo;

    mapping(uint256 => Claim) public claims; // epoch => claim
    mapping(uint256 => Challenge) public challenges; // epoch => challenge
    mapping(uint256 => bytes32) public relayed; // nonce/256 => packed replay bitmap

    /**
     * @dev The Fast Bridge participants watch for these events to decide if a challenge should be submitted.
     * @param epoch The epoch for which the the claim was made.
     * @param claimedStateRoot The claimed state root of the batched messages.
     */
    event Claimed(uint256 indexed epoch, bytes32 claimedStateRoot);

    /**
     * @dev This event indicates that `sendSafeFallback()` should be called on the sending side.
     * @param epoch The epoch associated with the challenged claim.
     */
    event Challenged(uint256 indexed epoch);

    /**
     * @dev This events indicates that optimistic verification has succeeded. The messages are ready to be relayed.
     * @param epoch The epoch associated with the batch.
     */
    event Verified(uint256 indexed epoch);

    /**
     * @dev This event indicates that the claim deposit has been withdrawn.
     * @param epoch The epoch associated with the batch.
     * @param bridger The recipient of the claim deposit.
     */
    event ClaimDepositWithdrawn(uint256 indexed epoch, address bridger);

    /**
     * @dev This event indicates that the challenge deposit has been withdrawn.
     * @param epoch The epoch associated with the batch.
     * @param challenger The recipient of the challenge deposit.
     */
    event ChallengeDepositWithdrawn(uint256 indexed epoch, address challenger);

    /**
     * @dev This event indicates that the claim deposit has been withdrawn.
     * @param epoch The epoch associated with the batch.
     * @param bridger The recipient of the claim deposit.
     */
    event ClaimDepositWithdrawnTimeout(uint256 indexed epoch, address bridger);

    /**
     * @dev This event indicates that the challenge deposit has been withdrawn.
     * @param epoch The epoch associated with the batch.
     * @param challenger The recipient of the challenge deposit.
     */
    event ChallengeDepositWithdrawnTimeout(uint256 indexed epoch, address challenger);

    /**
     * @dev This event indicates that a message has been relayed for the batch in this `_epoch`.
     * @param nonce The nonce of the message that was relayed.
     */
    event MessageRelayed(uint64 indexed nonce);

    modifier OnlyBridgeRunning() {
        require(block.timestamp < veaOutboxInfo.latestHeartbeatTimestamp + timeout, "Bridge Shutdown.");
        _;
    }

    modifier OnlyBridgeShutdown() {
        require(block.timestamp >= veaOutboxInfo.latestHeartbeatTimestamp + timeout, "Bridge Running.");
        _;
    }

    /**
     * @dev Constructor.
     * @param _deposit The deposit amount to submit a claim in wei.
     * @param _epochPeriod The duration of each epoch.
     * @param _challengePeriod The duration of the period allowing to challenge a claim.
     * @param _timeout The seconds before the bridge is considered shutdown.
     * @param _epochClaimWindow The number of epochs a claim can be submitted for.
     * @param _router The address of the challenge resolver router contract on Ethereum.
     * @param _amb The address of the AMB contract.
     */
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _timeout,
        uint256 _epochClaimWindow,
        address _veaInbox,
        address _router,
        address _amb,
        uint256 _maxMissingBlocks
    ) {
        deposit = _deposit;
        epochPeriod = _epochPeriod;
        challengePeriod = _challengePeriod;
        timeout = _timeout;
        epochClaimWindow = _epochClaimWindow;
        router = _router;
        amb = IAMB(_amb);
        maxMissingBlocks = _maxMissingBlocks;

        // claimant and challenger are not sybil resistant
        // must burn half deposit to prevent zero cost griefing
        burn = _deposit / 2;
        depositPlusReward = 2 * _deposit - burn;

        // calculating depositMinusOne once saves gas
        depositMinusOne = _deposit - 1;

        veaOutboxInfo.latestVerifiedEpoch = uint32(block.timestamp / epochPeriod) - 1;
        veaOutboxInfo.latestHeartbeatTimestamp = uint32(block.timestamp);
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /**
     * @dev Submit a claim about the the _stateRoot at _epoch and submit a deposit.
     * @param _epoch The epoch for which the claim is made.
     * @param _stateRoot The state root to claim.
     */
    function claim(uint256 _epoch, bytes32 _stateRoot) external payable {
        // msg.value >= deposit <=> msg.value > deposit - 1
        // precalculated depositMinusOne = deposit - 1 in constructor saves gas
        require(msg.value > depositMinusOne, "Insufficient claim deposit.");

        uint256 time = block.timestamp;

        unchecked {
            uint256 epochNow = time / epochPeriod;
            require(_epoch <= epochNow && _epoch > epochNow - epochClaimWindow, "Invalid epoch.");
        }

        require(_stateRoot != bytes32(0), "Invalid claim.");
        require(claims[_epoch].bridger == address(0), "Claim already made.");

        claims[_epoch] = Claim({
            stateRoot: _stateRoot,
            bridger: msg.sender,
            timestamp: uint32(time),
            blocknumber: uint32(block.number),
            honest: false
        });

        emit Claimed(_epoch, _stateRoot);
    }

    /**
     * @dev Submit a challenge for the claim of the current epoch's Fast Bridge batch merkleroot state and submit a deposit. The `batchMerkleRoot` in the claim already made for the last finalized epoch should be different from the one on the sending side, otherwise the sender will lose his deposit.
     * @param epoch The epoch of the claim to challenge.
     */
    function challenge(uint256 epoch) external payable {
        // msg.value >= deposit <=> msg.value > deposit - 1
        // precalculated depositMinusOne = deposit - 1 in constructor saves gas
        require(msg.value > depositMinusOne, "Insufficient challenge deposit.");

        require(claims[epoch].bridger != address(0), "No claim to challenge.");
        require(challenges[epoch].challenger == address(0), "Claim already challenged.");

        unchecked {
            require(block.timestamp < uint256(claims[epoch].timestamp) + challengePeriod, "Challenge period elapsed.");
        }

        challenges[epoch] = Challenge({challenger: msg.sender, honest: false});

        emit Challenged(epoch);
    }

    /**
     * @dev Resolves the optimistic claim for '_epoch'.
     * @param epoch The epoch of the optimistic claim.
     */
    function validateSnapshot(uint256 epoch) external OnlyBridgeRunning {
        Claim storage claim = claims[epoch];
        require(claim.bridger != address(0), "Invalid epoch, no claim to verify.");

        unchecked {
            require(block.timestamp > claim.timestamp + challengePeriod, "Challenge period has not yet elapsed.");
        }

        require(challenges[epoch].challenger == address(0), "Claim is challenged.");

        if (epoch > uint256(veaOutboxInfo.latestVerifiedEpoch)) {
            veaOutboxInfo.latestVerifiedEpoch = uint32(epoch);
            stateRoot = claim.stateRoot;
        }

        claim.honest = true;

        emit Verified(epoch);
    }

    /**
     * Note: Access restricted to arbitrum  bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param _epoch The epoch to verify.
     * @param _stateRoot The true state root for the epoch.
     */
    function resolveDisputedClaim(uint256 _epoch, bytes32 _stateRoot) external virtual OnlyBridgeRunning {
        require(msg.sender == address(amb), "Not from bridge.");
        require(amb.messageSender() == router, "Not from router.");

        if (_epoch > veaOutboxInfo.latestVerifiedEpoch && _stateRoot != bytes32(0)) {
            veaOutboxInfo.latestVerifiedEpoch = uint32(_epoch);
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

    function heartbeat(uint256 timestamp) external OnlyBridgeRunning {
        require(msg.sender == address(amb), "Not from bridge.");
        require(amb.messageSender() == router, "Not from router.");

        if (timestamp > veaOutboxInfo.latestHeartbeatTimestamp) {
            veaOutboxInfo.latestHeartbeatTimestamp = uint32(timestamp);
        }
    }

    /**
     * @dev Verifies and relays the message. UNTRUSTED.
     * @param proof The merkle proof to prove the message.
     * @param msgId The zero based index of the message in the inbox.
     * @param to The address of the contract on the receiving chain which receives the calldata.
     * @param message The message encoded with header from VeaInbox.
     */
    function sendMessage(bytes32[] calldata proof, uint64 msgId, address to, bytes calldata message) external {
        require(proof.length < 64, "Proof too long.");
        require(uint256(msgId) < 2 ** proof.length, "Path not minimal.");

        bytes32 nodeHash = keccak256(abi.encodePacked(msgId, to, message));

        // double hashed leaf
        // avoids second order preimage attacks
        // https://flawed.net.nz/2018/02/21/attacking-merkle-trees-with-a-second-preimage-attack/
        assembly {
            mstore(0x00, nodeHash)
            nodeHash := keccak256(0x00, 0x20)
        }

        unchecked {
            for (uint256 i = 0; i < proof.length; i++) {
                bytes32 proofElement = proof[i];
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

        // msgId is the zero based index of the message in the inbox and is the same index to prevent replay

        uint256 relayIndex = msgId >> 8;
        uint256 offset;

        unchecked {
            offset = msgId % 256;
        }

        bytes32 replay = relayed[relayIndex];

        require(((replay >> offset) & bytes32(uint256(1))) == bytes32(0), "Message already relayed");
        relayed[relayIndex] = replay | bytes32(1 << offset);

        // UNTRUSTED.
        (bool success, ) = to.call(message);
        require(success, "Failed to call contract");

        emit MessageRelayed(msgId);
    }

    /**
     * @dev Sends the deposit back to the Bridger if their claim is not successfully challenged. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
     * @param epoch The epoch associated with the claim deposit to withraw.
     */
    function withdrawClaimDeposit(uint256 epoch) external {
        require(claims[epoch].honest == true, "Claim failed.");

        address bridger = claims[epoch].bridger;

        // redundant check
        // honest == true and challenger != address(0) are equivalent
        require(bridger != address(0), "Claim does not exist");

        delete claims[epoch];

        if (challenges[epoch].challenger != address(0)) {
            delete challenges[epoch];
            payable(burnAddress).send(burn);
            payable(bridger).send(depositPlusReward);
        } else {
            payable(bridger).send(deposit);
        }

        emit ClaimDepositWithdrawn(epoch, bridger);
    }

    /**
     * @dev Sends the deposit back to the Challenger if their challenge is successful. Includes a portion of the Bridger's deposit.
     * @param epoch The epoch associated with the challenge deposit to withraw.
     */
    function withdrawChallengeDeposit(uint256 epoch) external {
        require(challenges[epoch].honest == true, "Challenge failed.");

        address challenger = challenges[epoch].challenger;

        // redundant check
        // honest == true and challenger != address(0) are equivalent
        require(challenger != address(0), "Challenge does not exist");

        delete challenges[epoch];
        delete claims[epoch];

        payable(burnAddress).send(burn); // half burnt
        payable(challenger).send(depositPlusReward); // User is responsibility for accepting ETH.

        emit ChallengeDepositWithdrawn(epoch, challenger);
    }

    /**
     * @dev Sends the deposit back to the Bridger if their claim is not successfully challenged. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
     * @param epoch The epoch associated with the claim deposit to withraw.
     */
    function withdrawClaimDepositTimeout(uint256 epoch) external OnlyBridgeShutdown {
        address bridger = claims[epoch].bridger;

        require(bridger != address(0), "Claim does not exist");
        require(claims[epoch].honest == false && challenges[epoch].honest == false, "Invalid timeout withdrawal.");

        delete claims[epoch];

        payable(bridger).send(deposit); // User is responsibility for accepting ETH.

        emit ClaimDepositWithdrawnTimeout(epoch, bridger);
    }

    /**
     * @dev Sends the deposit back to the Challenger if their challenge is successful. Includes a portion of the Bridger's deposit.
     * @param epoch The epoch associated with the challenge deposit to withraw.
     */
    function withdrawChallengeDepositTimeout(uint256 epoch) external OnlyBridgeShutdown {
        address challenger = challenges[epoch].challenger;

        require(challenger != address(0), "Challenge does not exist");
        require(claims[epoch].honest == false && challenges[epoch].honest == false, "Invalid timeout withdrawal.");

        delete challenges[epoch];

        payable(challenger).send(deposit); // User is responsibility for accepting ETH.

        emit ChallengeDepositWithdrawnTimeout(epoch, challenger);
        // Checks-Effects-Interaction
    }
}
