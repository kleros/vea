// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "../canonical/arbitrum/IInbox.sol";
import "../canonical/arbitrum/IOutbox.sol";
import "./interfaces/IVeaOutboxArbToOpt.sol";

/**
 * Vea Bridge Outbox From Arbitrum to Optimism.
 */
contract VeaOutboxArbToOpt is IVeaOutboxArbToOpt {
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

    IInbox public immutable inbox; // The address of the Arbitrum Inbox contract.
    address public immutable veaInbox; // The address of the veaInbox on arbitrum.

    uint256 public immutable deposit; // The deposit required to submit a claim or challenge
    uint256 internal immutable burn; // The amount of wei to burn. deposit / 2
    uint256 internal immutable depositPlusReward; // 2 * deposit - burn
    address internal constant burnAddress = address(0x0000000000000000000000000000000000000000);

    uint256 internal constant slotTime = 12; // Ethereum 12 second slot time

    uint256 public immutable epochPeriod; // Epochs mark the period between potential snapshots.
    uint256 public immutable challengePeriod; // Claim challenge timewindow.
    uint256 public immutable epochClaimDelay; // Can only claim for epochs after this delay. eg 1 => claims about epoch 1 can be made in epoch 2.
    uint256 public immutable epochClaimWindow; // The number of epochs after the delay that can be claimed. eg 1 => 2 epoch claims possible epochNow, epochNow - 1

    uint256 public immutable timeoutEpochs; // The number of epochs without forward progress before the bridge is considered shutdown.
    uint256 public immutable maxMissingBlocks; // The maximum number of blocks that can be missing in a challenge period.

    bytes32 public stateRoot;
    uint256 public latestVerifiedEpoch;

    mapping(uint256 => Claim) public claims; // epoch => claim
    mapping(uint256 => Challenge) public challenges; // epoch => challenge
    mapping(uint256 => bytes32) public relayed; // msgId/256 => packed replay bitmap

    /**
     * @dev Watcher check this event to challenge fraud.
     * @param epoch The epoch for which the the claim was made.
     * @param claimer The address of the claimer.
     */
    event Claimed(uint256 epoch, address indexed claimer);

    /**
     * @dev This event indicates that `sendSnapshot(epoch)` should be called in the inbox.
     * @param epoch The epoch associated with the challenged claim.
     * @param challenger The address of the challenger.
     */
    event Challenged(uint256 epoch, address indexed challenger);

    /**
     * @dev This event indicates that a message has been relayed.
     * @param msgId The msgId of the message that was relayed.
     */
    event MessageRelayed(uint64 msgId);

    modifier OnlyBridgeRunning() {
        unchecked {
            require(block.timestamp / epochPeriod <= latestVerifiedEpoch + timeoutEpochs, "Bridge Shutdown.");
        }
        _;
    }

    modifier OnlyBridgeShutdown() {
        unchecked {
            require(latestVerifiedEpoch + timeoutEpochs < block.timestamp / epochPeriod, "Bridge Running.");
        }
        _;
    }

    /**
     * @dev Constructor.
     * @param _deposit The deposit amount to submit a claim in wei.
     * @param _epochPeriod The duration of each epoch.
     * @param _challengePeriod The duration of the period allowing to challenge a claim.
     * @param _timeoutEpochs The epochs before the bridge is considered shutdown.
     * @param _epochClaimDelay The number of epochs a claim can be submitted for.
     * @param _veaInbox The address of the inbox contract on Arbitrum.
     * @param _inbox The address of the inbox contract on Ethereum.
     * @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
     */
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _timeoutEpochs,
        uint256 _epochClaimDelay,
        uint256 _epochClaimWindow,
        address _veaInbox,
        address _inbox,
        uint256 _maxMissingBlocks
    ) {
        deposit = _deposit;
        epochPeriod = _epochPeriod;
        challengePeriod = _challengePeriod;
        timeoutEpochs = _timeoutEpochs;
        epochClaimDelay = _epochClaimDelay;
        epochClaimWindow = _epochClaimWindow;
        veaInbox = _veaInbox;
        inbox = IInbox(_inbox);
        maxMissingBlocks = _maxMissingBlocks;

        // claimant and challenger are not sybil resistant
        // must burn half deposit to prevent zero cost griefing
        burn = _deposit / 2;
        depositPlusReward = 2 * _deposit - burn;

        latestVerifiedEpoch = block.timestamp / epochPeriod - 1;

        unchecked {
            uint256 epochNow = block.timestamp / epochPeriod;
            require(epochClaimDelay + epochClaimWindow <= epochNow, "Invalid epochClaimDelay.");
        }

        require(challengePeriod < epochClaimWindow * epochPeriod, "Invalid challengePeriod.");
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
        require(msg.value >= deposit, "Insufficient claim deposit.");

        unchecked {
            uint256 epochNow = block.timestamp / epochPeriod;
            require(
                epochNow - epochClaimDelay - epochClaimWindow <= _epoch && _epoch <= epochNow - epochClaimDelay,
                "Invalid epoch."
            );
        }

        require(_stateRoot != bytes32(0), "Invalid claim.");
        require(claims[_epoch].bridger == address(0), "Claim already made.");

        claims[_epoch] = Claim({
            stateRoot: _stateRoot,
            bridger: msg.sender,
            timestamp: uint32(block.timestamp),
            blocknumber: uint32(block.number),
            honest: false
        });

        emit Claimed(_epoch, msg.sender);
    }

    /**
     * @dev Submit a challenge for the claim of the inbox state root snapshot taken at 'epoch'.
     * @param epoch The epoch of the claim to challenge.
     */
    function challenge(uint256 epoch) external payable {
        require(msg.value >= deposit, "Insufficient challenge deposit.");

        require(claims[epoch].bridger != address(0), "No claim to challenge.");
        require(challenges[epoch].challenger == address(0), "Claim already challenged.");

        unchecked {
            require(block.timestamp < uint256(claims[epoch].timestamp) + challengePeriod, "Challenge period elapsed.");
        }

        challenges[epoch] = Challenge({challenger: msg.sender, honest: false});

        emit Challenged(epoch, msg.sender);
    }

    /**
     * @dev Resolves the optimistic claim for '_epoch'.
     * @param epoch The epoch of the optimistic claim.
     */
    function validateSnapshot(uint256 epoch) external OnlyBridgeRunning {
        Claim storage claim = claims[epoch];

        require(claim.bridger != address(0), "Invalid epoch, no claim to verify.");

        unchecked {
            require(
                uint256(claim.timestamp) + challengePeriod < block.timestamp,
                "Challenge period has not yet elapsed."
            );
            require(
                // expected blocks <= actual blocks + maxMissingBlocks
                (block.timestamp - uint256(claim.timestamp)) / slotTime <=
                    block.number - uint256(claim.blocknumber) + maxMissingBlocks,
                "Too many missing blocks. Possible censorship attack. Use canonical bridge."
            );
        }

        require(challenges[epoch].challenger == address(0), "Claim is challenged.");

        if (epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = epoch;
            stateRoot = claim.stateRoot;
        }

        claim.honest = true;
    }

    /**
     * Note: Access restricted to arbitrum  bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param epoch The epoch to verify.
     * @param _stateRoot The true state root for the epoch.
     */
    function resolveDisputedClaim(uint256 epoch, bytes32 _stateRoot) external virtual OnlyBridgeRunning {
        IBridge bridge = inbox.bridge();
        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInbox, "Sender only.");

        if (epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = epoch;

            if (_stateRoot != bytes32(0)) {
                stateRoot = _stateRoot;
            }
        }

        Claim storage claim = claims[epoch];
        Challenge storage challenge = challenges[epoch];

        if (claim.bridger != address(0) && claim.stateRoot == _stateRoot) {
            claim.honest = true;
        } else if (challenge.challenger != address(0)) {
            challenge.honest = true;
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
        // honest == true => bridger != address(0)
        require(bridger != address(0), "Claim does not exist");

        delete claims[epoch];

        if (challenges[epoch].challenger != address(0)) {
            delete challenges[epoch];
            payable(burnAddress).send(burn);
            payable(bridger).send(depositPlusReward); // User is responsibility for accepting ETH.
        } else {
            payable(bridger).send(deposit); // User is responsibility for accepting ETH.
        }
    }

    /**
     * @dev Sends the deposit back to the Challenger if their challenge is successful. Includes a portion of the Bridger's deposit.
     * @param epoch The epoch associated with the challenge deposit to withraw.
     */
    function withdrawChallengeDeposit(uint256 epoch) external {
        require(challenges[epoch].honest == true, "Challenge failed.");

        address challenger = challenges[epoch].challenger;

        // redundant check
        // honest == true => challenger != address(0)
        require(challenger != address(0), "Challenge does not exist");

        delete challenges[epoch];
        delete claims[epoch];

        payable(burnAddress).send(burn); // half burnt
        payable(challenger).send(depositPlusReward); // User is responsibility for accepting ETH.
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
    }
}
