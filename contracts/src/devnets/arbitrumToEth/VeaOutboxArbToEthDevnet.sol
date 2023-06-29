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
    /// @param _deposit The deposit amount to submit a claim in wei.
    /// @param _epochPeriod The duration of each epoch.
    /// @param _minChallengePeriod The minimum time window to challenge a claim.
    /// @param _timeoutEpochs The epochs before the bridge is considered shutdown.
    /// @param _veaInboxArbToEthDevnet The address of the inbox contract on Arbitrum.
    /// @param _maxMissingBlocks The maximum number of blocks that can be missing in a challenge period.
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _minChallengePeriod,
        uint256 _timeoutEpochs,
        address _veaInboxArbToEthDevnet,
        address _bridge,
        uint256 _maxMissingBlocks
    )
        VeaOutboxArbToEth(
            _deposit,
            _epochPeriod,
            _minChallengePeriod,
            _timeoutEpochs,
            _veaInboxArbToEthDevnet,
            _bridge,
            _maxMissingBlocks
        )
    {
        devnetOperator = msg.sender;
    }
}
