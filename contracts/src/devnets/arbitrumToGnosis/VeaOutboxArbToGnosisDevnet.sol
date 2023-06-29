// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../../arbitrumToGnosis/VeaOutboxArbToGnosis.sol";

/// @dev Vea Outbox From ArbitrumGoerli to Chiado.
/// Note: This contract is deployed on Chiado.
/// Note: This contract is permissioned for developer testing (devnet).
contract VeaOutboxArbToGnosisDevnet is VeaOutboxArbToGnosis {
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
    function claim(uint256 _epoch, bytes32 _stateRoot) public override onlyByDevnetOperator {
        require(weth.transferFrom(msg.sender, address(this), deposit), "Failed WETH transfer.");
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
    }

    /// @dev Start verification for claim for 'epoch'.
    /// @param _epoch The epoch of the claim to challenge.
    /// @param _claim The claim associated with the epoch.
    function startVerification(uint256 _epoch, Claim memory _claim) public override onlyByDevnetOperator {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");

        _claim.timestampVerification = uint32(block.timestamp);
        _claim.blocknumberVerification = uint32(block.number);

        claimHashes[_epoch] = hashClaim(_claim);

        emit VerificationStarted(_epoch);
    }

    /// @dev Sends the deposit back to the Claimer if successful. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
    /// @param _epoch The epoch associated with the claim deposit to withraw.
    /// @param _claim The claim associated with the epoch.
    function withdrawClaimDeposit(uint256 _epoch, Claim memory _claim) public override {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.honest == Party.Claimer, "Claim failed.");

        delete claimHashes[_epoch];

        if (_claim.challenger != address(0)) {
            weth.burn(burn); // no return value to check
            require(weth.transfer(_claim.claimer, depositPlusReward), "Failed WETH transfer."); // should revert on errors, but we check return value anyways
        } else {
            require(weth.transfer(_claim.claimer, deposit), "Failed WETH transfer."); // should revert on errors, but we check return value anyways
        }
    }

    /// @dev Resolves the optimistic claim for '_epoch'.
    /// @param _epoch The epoch of the optimistic claim.
    /// @param _claim The claim associated with the epoch.
    function verifySnapshot(uint256 _epoch, Claim memory _claim) public override OnlyBridgeRunning {
        require(claimHashes[_epoch] == hashClaim(_claim), "Invalid claim.");
        require(_claim.challenger == address(0), "Claim is challenged.");

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;
            stateRoot = _claim.stateRoot;
            emit Verified(_epoch);
        }

        _claim.honest = Party.Claimer;
        claimHashes[_epoch] = hashClaim(_claim);
    }

    /// @dev Testnet operator utility function to claim, validate and withdraw.
    /// @param _epoch The epoch for which the claim is made.
    /// @param _stateroot The state root to claim.
    function devnetAdvanceState(uint256 _epoch, bytes32 _stateroot) external payable {
        claim(_epoch, _stateroot);
        Claim memory claim = Claim({
            stateRoot: _stateroot,
            claimer: msg.sender,
            timestampClaimed: uint32(block.timestamp),
            timestampVerification: uint32(0),
            blocknumberVerification: uint32(0),
            honest: Party.None,
            challenger: address(0)
        });
        claim.timestampClaimed = uint32(block.timestamp);
        startVerification(_epoch, claim);
        claim.timestampVerification = uint32(block.timestamp);
        claim.blocknumberVerification = uint32(block.number);
        verifySnapshot(_epoch, claim);
        claim.honest = Party.Claimer;
        withdrawClaimDeposit(_epoch, claim);
    }

    /// @dev Constructor.
    /// Note: epochPeriod must match the VeaInboxArbToGnosis contract deployment on Arbitrum, since it's on a different chain, we can't read it and trust the deployer to set a correct value
    /// @param _deposit The deposit amount to submit a claim in wei.
    /// @param _epochPeriod The duration of each epoch.
    /// @param _minChallengePeriod The minimum time window to challenge a claim.
    /// @param _timeoutEpochs The epochs before the bridge is considered shutdown.
    /// @param _amb The address of the AMB contract on Gnosis.
    /// @param _routerArbToGnosis The address of the router on Ethereum that routes from Arbitrum to Gnosis.
    /// @param _sequencerDelayLimit The maximum delay in seconds that the Arbitrum sequencer can backdate transactions.
    /// @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
    /// @param _routerChainId The chain id of the routerArbToGnosis.
    /// @param _weth The address of the WETH contract on Gnosis.
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _minChallengePeriod,
        uint256 _timeoutEpochs,
        IAMB _amb,
        address _routerArbToGnosis,
        uint256 _sequencerDelayLimit,
        uint256 _maxMissingBlocks,
        uint256 _routerChainId,
        IWETH _weth
    )
        VeaOutboxArbToGnosis(
            _deposit,
            _epochPeriod,
            _minChallengePeriod,
            _timeoutEpochs,
            _amb,
            _routerArbToGnosis,
            _sequencerDelayLimit,
            _maxMissingBlocks,
            _routerChainId,
            _weth
        )
    {
        devnetOperator = msg.sender;
    }
}
