// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../../arbitrumToGnosis/VeaOutboxArbToGnosis.sol";

contract VeaOutboxArbToGnosisDevnet is VeaOutboxArbToGnosis {
    address public testnetOperator;

    function changeTestnetOperator(address _testnetOperator) external {
        require(msg.sender == testnetOperator, "Invalid Testnet Operator");
        testnetOperator = _testnetOperator;
    }

    /**
     * @dev Submit a claim about the _stateRoot at _epoch and submit a deposit.
     * @param _epoch The epoch for which the claim is made.
     * @param _stateRoot The state root to claim.
     */
    function claim(uint256 _epoch, bytes32 _stateRoot) public payable override {
        require(msg.value >= deposit, "Insufficient claim deposit.");
        require(msg.sender == testnetOperator, "Invalid Testnet Operator");

        unchecked {
            require((block.timestamp - claimDelay) / epochPeriod == _epoch, "Invalid epoch.");
        }

        require(_stateRoot != bytes32(0), "Invalid claim.");
        require(claimHashes[_epoch] == bytes32(0), "Claim already made.");

        claimHashes[_epoch] = hashClaim(
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
     */
    function challenge(uint256 epoch, Claim memory claim) external payable override {
        require(claimHashes[epoch] == hashClaim(claim), "Invalid claim.");
        require(claim.challenger == address(0), "Claim already challenged.");
        require(msg.value >= deposit, "Insufficient challenge deposit.");
        require(msg.sender == testnetOperator, "Invalid Testnet Operator");

        unchecked {
            require(block.timestamp < uint256(claim.timestamp) + challengePeriod, "Challenge period elapsed.");
        }

        claim.challenger = msg.sender;
        claimHashes[epoch] = hashClaim(claim);

        emit Challenged(epoch, msg.sender);
    }

    /**
     * @dev Sends the deposit back to the Bridger if their claim is not successfully challenged. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
     * @param epoch The epoch associated with the claim deposit to withraw.
     */
    function withdrawClaimDeposit(uint256 epoch, Claim memory claim) public override {
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
     * @dev Resolves the optimistic claim for '_epoch'.
     * @param epoch The epoch of the optimistic claim.
     */
    function validateSnapshot(uint256 epoch, Claim memory claim) public override OnlyBridgeRunning {
        require(claimHashes[epoch] == hashClaim(claim), "Invalid claim.");

        unchecked {
            require(claim.timestamp + challengePeriod <= block.timestamp, "Challenge period has not yet elapsed.");
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
     * @dev Testnet operator utility function to claim, validate and withdraw.
     * @param epoch The epoch for which the claim is made.
     * @param stateroot The state root to claim.
     */
    function devnetAdvanceState(uint256 epoch, bytes32 stateroot) external payable {
        claim(epoch, stateroot);
        validateSnapshot(
            epoch,
            Claim({
                stateRoot: stateroot,
                claimer: msg.sender,
                timestamp: uint32(block.timestamp),
                blocknumber: uint32(block.number),
                honest: Party.None,
                challenger: address(0)
            })
        );
        withdrawClaimDeposit(
            epoch,
            Claim({
                stateRoot: stateroot,
                claimer: msg.sender,
                timestamp: uint32(block.timestamp),
                blocknumber: uint32(block.number),
                honest: Party.Claimer,
                challenger: address(0)
            })
        );
    }

    /**
     * @dev Constructor.
     * @param _deposit The deposit amount to submit a claim in wei.
     * @param _epochPeriod The duration of each epoch.
     * @param _challengePeriod The duration of the period allowing to challenge a claim.
     * @param _timeoutEpochs The epochs before the bridge is considered shutdown.
     * @param _claimDelay The number of epochs a claim can be submitted for.
     * @param _amb The address of the AMB contract on Gnosis.
     * @param _router The address of the challenge resolver router contract on Ethereum.
     * @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
     */
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _timeoutEpochs,
        uint256 _claimDelay,
        IAMB _amb,
        address _router,
        uint256 _maxMissingBlocks
    )
        VeaOutboxArbToGnosis(
            _deposit,
            _epochPeriod,
            _challengePeriod,
            _timeoutEpochs,
            _claimDelay,
            _amb,
            _router,
            _maxMissingBlocks
        )
    {
        testnetOperator = msg.sender;
    }
}
