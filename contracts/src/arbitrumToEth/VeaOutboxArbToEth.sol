// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../canonical/arbitrum/IBridge.sol";
import "../canonical/arbitrum/IOutbox.sol";
import "../interfaces/outboxes/IVeaOutboxOnL1.sol";

/**
 * Vea Bridge Outbox From Arbitrum to Ethereum.
 */
contract VeaOutboxArbToEth is IVeaOutboxOnL1 {
    IBridge public immutable bridge; // The address of the Arbitrum bridge contract.
    address public immutable veaInbox; // The address of the veaInbox on arbitrum.

    uint256 public immutable deposit; // The deposit in wei required to submit a claim or challenge
    uint256 internal immutable burn; // The amount of wei to burn. deposit / 2
    uint256 internal immutable depositPlusReward; // 2 * deposit - burn
    address internal constant burnAddress = address(0);

    uint256 internal constant slotTime = 12; // Ethereum 12 second slot time

    uint256 public immutable epochPeriod; // Epochs mark the period between potential snapshots.
    uint256 public immutable challengePeriod; // Time window to challenge a claim.
    uint256 public immutable claimDelay; // Can only claim for epochs after this delay (seconds)

    uint256 public immutable timeoutEpochs; // The number of epochs without forward progress before the bridge is considered shutdown.
    uint256 public immutable maxMissingBlocks; // The maximum number of blocks that can be missing in a challenge period.

    bytes32 public stateRoot;
    uint256 public latestVerifiedEpoch;

    mapping(uint256 => bytes32) public claimHashes; // epoch => claim
    mapping(uint256 => bytes32) public relayed; // msgId/256 => packed replay bitmap, preferred over a simple boolean mapping to save 15k gas per message

    /**
     * @dev Watcher check this event to challenge fraud.
     * @param claimer The address of the claimer.
     * @param stateRoot The state root of the claim.
     */
    event Claimed(address indexed claimer, bytes32 stateRoot);

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

    /**
     * @dev This events indicates that verification has succeeded. The messages are ready to be relayed.
     * @param epoch The epoch that was verified.
     */
    event Verified(uint256 epoch);

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
     * Note: epochPeriod must match the VeaInboxArbToEth contract deployment on Arbitrum, since it's on a different chain, we can't read it and trust the deployer to set a correct value
     * @param _deposit The deposit amount to submit a claim in wei.
     * @param _epochPeriod The duration of each epoch.
     * @param _challengePeriod The duration of the period allowing to challenge a claim.
     * @param _timeoutEpochs The epochs before the bridge is considered shutdown.
     * @param _claimDelay The number of epochs after which the claim can be submitted.
     * @param _veaInbox The address of the inbox contract on Arbitrum.
     * @param _bridge The address of the arbitrum bridge contract on Ethereum.
     * @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
     */
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _timeoutEpochs,
        uint256 _claimDelay,
        address _veaInbox,
        address _bridge,
        uint256 _maxMissingBlocks
    ) {
        deposit = _deposit;
        // epochPeriod must match the VeaInboxArbToEth contract deployment epochPeriod value.
        epochPeriod = _epochPeriod;
        challengePeriod = _challengePeriod;
        timeoutEpochs = _timeoutEpochs;
        claimDelay = _claimDelay;
        veaInbox = _veaInbox;
        bridge = IBridge(_bridge);
        maxMissingBlocks = _maxMissingBlocks;

        // claimant and challenger are not sybil resistant
        // must burn half deposit to prevent zero cost griefing
        burn = _deposit / 2;
        depositPlusReward = 2 * _deposit - burn;

        latestVerifiedEpoch = block.timestamp / epochPeriod - 1;

        // claimDelay should never be set this high, but we santiy check to prevent underflow
        require(claimDelay <= block.timestamp, "Invalid epochClaimDelay.");
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /**
     * @dev Submit a claim about the _stateRoot at _epoch and submit a deposit.
     * @param epoch The epoch for which the claim is made.
     * @param _stateRoot The state root to claim.
     */
    function claim(uint256 epoch, bytes32 _stateRoot) external payable virtual {
        require(msg.value >= deposit, "Insufficient claim deposit.");

        unchecked {
            require((block.timestamp - claimDelay) / epochPeriod == epoch, "Invalid epoch.");
        }

        require(_stateRoot != bytes32(0), "Invalid claim.");
        require(claimHashes[epoch] == bytes32(0), "Claim already made.");

        claimHashes[epoch] = hashClaim(
            Claim({
                stateRoot: _stateRoot,
                claimer: msg.sender,
                timestamp: uint32(block.timestamp),
                blocknumber: uint32(block.number),
                honest: Party.None,
                challenger: address(0)
            })
        );

        emit Claimed(msg.sender, _stateRoot);
    }

    /**
     * @dev Submit a challenge for the claim of the inbox state root snapshot taken at 'epoch'.
     * @param epoch The epoch of the claim to challenge.
     * @param claim The claim associated with the epoch.
     */
    function challenge(uint256 epoch, Claim memory claim) external payable virtual {
        require(claimHashes[epoch] == hashClaim(claim), "Invalid claim.");
        require(claim.challenger == address(0), "Claim already challenged.");
        require(msg.value >= deposit, "Insufficient challenge deposit.");

        unchecked {
            require(block.timestamp < uint256(claim.timestamp) + challengePeriod, "Challenge period elapsed.");
        }

        claim.challenger = msg.sender;
        claimHashes[epoch] = hashClaim(claim);

        emit Challenged(epoch, msg.sender);
    }

    /**
     * @dev Resolves the optimistic claim for '_epoch'.
     * @param epoch The epoch of the optimistic claim.
     * @param claim The claim associated with the epoch.
     */
    function validateSnapshot(uint256 epoch, Claim memory claim) external virtual OnlyBridgeRunning {
        require(claimHashes[epoch] == hashClaim(claim), "Invalid claim.");

        unchecked {
            require(claim.timestamp + challengePeriod < block.timestamp, "Challenge period has not yet elapsed.");
            require(
                // expected blocks <= actual blocks + maxMissingBlocks
                uint256(claim.blocknumber) + (block.timestamp - uint256(claim.timestamp)) / slotTime <=
                    block.number + maxMissingBlocks,
                "Too many missing blocks. Possible censorship attack. Use canonical bridge."
            );
        }

        require(claim.challenger == address(0), "Claim is challenged.");

        if (epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = epoch;
            stateRoot = claim.stateRoot;
            emit Verified(epoch);
        }

        claim.honest = Party.Claimer;
        claimHashes[epoch] = hashClaim(claim);
    }

    /**
     * Note: Access restricted to arbitrum  bridge.
     * @dev Resolves any challenge of the optimistic claim for '_epoch'.
     * @param epoch The epoch to verify.
     * @param _stateRoot The true state root for the epoch.
     * @param claim The claim associated with the epoch
     */
    function resolveDisputedClaim(
        uint256 epoch,
        bytes32 _stateRoot,
        Claim memory claim
    ) external virtual OnlyBridgeRunning {
        // Arbitrum -> Ethereum message sender authentication
        // docs: https://developer.arbitrum.io/arbos/l2-to-l1-messaging/
        // example: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/dfef6a68ee18dbd2e1f5a099061a3b8a0e404485/contracts/crosschain/arbitrum/LibArbitrumL1.sol#L34
        // example: https://github.com/OffchainLabs/arbitrum-tutorials/blob/2c1b7d2db8f36efa496e35b561864c0f94123a5f/packages/greeter/contracts/ethereum/GreeterL1.sol#L50
        // note: we use the bridge address as a source of truth for the activeOutbox address

        require(msg.sender == address(bridge), "Not from bridge.");
        require(IOutbox(bridge.activeOutbox()).l2ToL1Sender() == veaInbox, "veaInbox only.");

        if (epoch > latestVerifiedEpoch && _stateRoot != bytes32(0)) {
            latestVerifiedEpoch = epoch;
            stateRoot = _stateRoot;
            emit Verified(epoch);
        }

        if (claimHashes[epoch] == hashClaim(claim) && claim.honest == Party.None) {
            if (claim.stateRoot == _stateRoot) {
                claim.honest = Party.Claimer;
            } else if (claim.challenger != address(0)) {
                claim.honest = Party.Challenger;
            }
            claimHashes[epoch] = hashClaim(claim);
        }
    }

    /**
     * @dev Verifies and relays the message. UNTRUSTED.
     * @param proof The merkle proof to prove the message.
     * @param msgId The zero based index of the message in the inbox.
     * @param to The address of the contract on Ethereum to call.
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

        // msgId is the zero-based index of the message in the inbox.
        // msgId is also used as an index in the relayed bitmap to prevent replay.
        // Note: a bitmap is used instead of a simple boolean mapping to save 15k gas per message.

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
     * @dev Sends the deposit back to the Claimer if successful. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
     * @param epoch The epoch associated with the claim deposit to withraw.
     * @param claim The claim associated with the epoch.
     */
    function withdrawClaimDeposit(uint256 epoch, Claim calldata claim) external virtual {
        require(claimHashes[epoch] == hashClaim(claim), "Invalid claim.");
        require(claim.honest == Party.Claimer, "Claim failed.");

        delete claimHashes[epoch];

        if (claim.challenger != address(0)) {
            payable(burnAddress).send(burn);
            payable(claim.claimer).send(depositPlusReward); // User is responsible for accepting ETH.
        } else {
            payable(claim.claimer).send(deposit); // User is responsible for accepting ETH.
        }
    }

    /**
     * @dev Sends the deposit back to the Challenger if successful. Includes a portion of the Bridger's deposit.
     * @param epoch The epoch associated with the challenge deposit to withraw.
     * @param claim The claim associated with the epoch.
     */
    function withdrawChallengeDeposit(uint256 epoch, Claim calldata claim) external {
        require(claimHashes[epoch] == hashClaim(claim), "Invalid claim.");
        require(claim.honest == Party.Challenger, "Challenge failed.");

        delete claimHashes[epoch];

        payable(burnAddress).send(burn); // half burnt
        payable(claim.challenger).send(depositPlusReward); // User is responsible for accepting ETH.
    }

    /**
     * @dev When bridge is shutdown, no claim disputes can be resolved. This allows the claimer to withdraw their deposit.
     * @param epoch The epoch associated with the claim deposit to withraw.
     * @param claim The claim associated with the epoch.
     */
    function withdrawClaimerEscapeHatch(uint256 epoch, Claim memory claim) external OnlyBridgeShutdown {
        require(claimHashes[epoch] == hashClaim(claim), "Invalid claim.");
        require(claim.honest == Party.None, "Claim resolved.");

        if (claim.claimer != address(0)) {
            if (claim.challenger == address(0)) {
                delete claimHashes[epoch];
                payable(claim.claimer).send(deposit); // User is responsible for accepting ETH.
            } else {
                address claimer = claim.claimer;
                claim.claimer = address(0);
                claimHashes[epoch] == hashClaim(claim);
                payable(claimer).send(deposit); // User is responsible for accepting ETH.
            }
        }
    }

    /**
     * @dev When bridge is shutdown, no claim disputes can be resolved. This allows the challenger to withdraw their deposit.
     * @param epoch The epoch associated with the claim deposit to withraw.
     * @param claim The claim associated with the epoch.
     */
    function withdrawChallengerEscapeHatch(uint256 epoch, Claim memory claim) external OnlyBridgeShutdown {
        require(claimHashes[epoch] == hashClaim(claim), "Invalid claim.");
        require(claim.honest == Party.None, "Claim resolved.");

        if (claim.challenger != address(0)) {
            if (claim.claimer == address(0)) {
                delete claimHashes[epoch];
                payable(claim.challenger).send(deposit); // User is responsible for accepting ETH.
            } else {
                address challenger = claim.challenger;
                claim.challenger = address(0);
                claimHashes[epoch] == hashClaim(claim);
                payable(challenger).send(deposit); // User is responsible for accepting ETH.
            }
        }
    }

    /**
     * @dev Hashes the claim.
     * @param claim The claim to hash.
     * @return hashedClaim The hash of the claim.
     */
    function hashClaim(Claim memory claim) public pure returns (bytes32 hashedClaim) {
        return
            hashedClaim = keccak256(
                abi.encodePacked(
                    claim.stateRoot,
                    claim.claimer,
                    claim.timestamp,
                    claim.blocknumber,
                    claim.honest,
                    claim.challenger
                )
            );
    }

    /**
     * @dev Claim passed censorship test
     * @param claim The claim to test.
     * @return testPassed True if the claim passed the censorship test.
     */
    function passedTest(Claim calldata claim) external view returns (bool testPassed) {
        uint256 expectedBlocks = uint256(claim.blocknumber) + (block.timestamp - uint256(claim.timestamp)) / slotTime;
        uint256 actualBlocks = block.number;
        testPassed = (expectedBlocks <= actualBlocks + maxMissingBlocks);
    }
}
