// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../../arbitrumToEth/VeaOutboxArbToEth.sol";

/// @dev Vea Outbox From ArbitrumGoerli to Goerli.
/// Note: This contract is deployed on Goerli.
/// Note: This contract is permissioned for developer testing (devnet).
contract VeaOutboxArbToEthDevnet is VeaOutboxArbToEth {
    address public devnetOperator; // permissioned devnet operator

    /// @dev Requires that the sender is the devnet operator.
    modifier onlyByDevnetOperator() {
        require(devnetOperator == msg.sender);
        _;
    }

    /// @dev Changes the devnet operator.
    /// @param _devnetOperator The new testnet operator.
    function changeDevnetOperator(address _devnetOperator) external onlyByDevnetOperator {
        require(msg.sender == devnetOperator, "Invalid Testnet Operator");
        devnetOperator = _devnetOperator;
    }

    /// @dev Submit a claim about the _stateRoot at _epoch and submit a deposit.
    /// @param _epoch The epoch for which the claim is made.
    /// @param _stateRoot The state root to claim.
    function claim(uint256 _epoch, bytes32 _stateRoot) public payable override onlyByDevnetOperator {
        require(msg.value >= deposit, "Insufficient claim deposit.");

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

    /// @dev Submit a challenge for the claim of the inbox state root snapshot taken at 'epoch'.
    /// @param _epoch The epoch of the claim to challenge.
    /// @param _claim The claim associated with the epoch.
    function challenge(uint256 _epoch, Claim memory _claim) external payable override onlyByDevnetOperator {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.challenger == address(0), "Claim already challenged.");
        require(msg.value >= deposit, "Insufficient challenge deposit.");

        unchecked {
            require(block.timestamp < uint256(_claim.timestamp) + challengePeriod, "Challenge period elapsed.");
        }

        _claim.challenger = msg.sender;
        claimHashes[_epoch] = hashClaim(_claim);

        emit Challenged(_epoch, msg.sender);
    }

    /// @dev Sends the deposit back to the Bridger if their claim is not successfully challenged. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
    /// @param _claim The claim associated with the epoch.
    /// @param _epoch The epoch associated with the claim deposit to withraw.
    function withdrawClaimDeposit(uint256 _epoch, Claim memory _claim) public override {
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

    /// @dev Resolves the optimistic claim for '_epoch'.
    /// @param epoch The epoch of the optimistic claim.
    /// @param _claim The claim associated with the epoch.
    function validateSnapshot(uint256 epoch, Claim memory _claim) public override OnlyBridgeRunning {
        require(claimHashes[epoch] == hashClaim(_claim), "Invalid claim.");

        unchecked {
            require(_claim.timestamp + challengePeriod <= block.timestamp, "Challenge period has not yet elapsed.");
            require(
                // expected blocks <= actual blocks + maxMissingBlocks
                uint256(_claim.blocknumber) + (block.timestamp - uint256(_claim.timestamp)) / SLOT_TIME <=
                    block.number + maxMissingBlocks,
                "Too many missing blocks. Possible censorship attack. Use canonical bridge."
            );
        }

        require(_claim.challenger == address(0), "Claim is challenged.");

        if (epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = epoch;
            stateRoot = _claim.stateRoot;
            emit Verified(epoch);
        }

        _claim.honest = Party.Claimer;
        claimHashes[epoch] = hashClaim(_claim);
    }

    /// @dev Testnet operator utility function to claim, validate and withdraw.
    /// @param _epoch The epoch for which the claim is made.
    /// @param _stateroot The state root to claim.
    function devnetAdvanceState(uint256 _epoch, bytes32 _stateroot) external payable {
        claim(_epoch, _stateroot);
        validateSnapshot(
            _epoch,
            Claim({
                stateRoot: _stateroot,
                claimer: msg.sender,
                timestamp: uint32(block.timestamp),
                blocknumber: uint32(block.number),
                honest: Party.None,
                challenger: address(0)
            })
        );
        withdrawClaimDeposit(
            _epoch,
            Claim({
                stateRoot: _stateroot,
                claimer: msg.sender,
                timestamp: uint32(block.timestamp),
                blocknumber: uint32(block.number),
                honest: Party.Claimer,
                challenger: address(0)
            })
        );
    }

    /// @dev Constructor.
    /// @param _deposit The deposit amount to submit a claim in wei.
    /// @param _epochPeriod The duration of each epoch.
    /// @param _challengePeriod The duration of the period allowing to challenge a claim.
    /// @param _timeoutEpochs The epochs before the bridge is considered shutdown.
    /// @param _epochClaimDelay The number of epochs a claim can be submitted for.
    /// @param _veaInboxArbToEthDevnet The address of the devnet vea inbox on Arbitrum to Ethereum.
    /// @param _bridge The address of the Arbitrum bridge contract on Ethereum.
    /// @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _timeoutEpochs,
        uint256 _epochClaimDelay,
        address _veaInboxArbToEthDevnet,
        address _bridge,
        uint256 _maxMissingBlocks
    )
        VeaOutboxArbToEth(
            _deposit,
            _epochPeriod,
            _challengePeriod,
            _timeoutEpochs,
            _epochClaimDelay,
            _veaInboxArbToEthDevnet,
            _bridge,
            _maxMissingBlocks
        )
    {
        devnetOperator = msg.sender;
    }
}
