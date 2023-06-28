// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../../gnosisToArbitrum/VeaOutboxGnosisToArb.sol";

/// @dev Vea Outbox From Chiado to ArbitrumGoerli.
/// Note: This contract is deployed on ArbitrumGoerli.
/// Note: This contract is permissioned for developer testing (devnet).
contract VeaOutboxGnosisToArbDevnet is VeaOutboxGnosisToArb {
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

        uint256 epochMaxClaimableCalculated = (block.timestamp + sequencerDelayLimit) / epochPeriod + 1;
        uint256 epochMaxClaimableCap = block.timestamp / epochPeriod + maxClaimFutureEpochs;
        uint256 epochMaxClaimable = epochMaxClaimableCalculated < epochMaxClaimableCap
            ? epochMaxClaimableCalculated
            : epochMaxClaimableCap;

        require(_epoch <= epochMaxClaimable, "Epoch is invalid.");

        uint256 epochMinClaimableCalculated = (block.timestamp - sequencerFutureLimit) / epochPeriod - 1;
        uint256 epochMinClaimableCap = block.timestamp / epochPeriod - maxClaimDelayEpochs;
        uint256 epochMinClaimable = epochMinClaimableCalculated > epochMinClaimableCap
            ? epochMinClaimableCap
            : epochMinClaimableCap;

        require(_epoch >= epochMinClaimable, "Epoch is invalid.");

        require(_stateRoot != bytes32(0), "Invalid claim.");
        require(claims[_epoch].claimer == address(0), "Claim already made.");

        claims[_epoch] = Claim({
            stateRoot: _stateRoot,
            claimer: msg.sender,
            timestamp: uint32(block.timestamp),
            honest: Party.None
        });

        emit Claimed(msg.sender, _stateRoot);

        // Refund overpayment.
        if (msg.value > deposit) {
            uint256 refund = msg.value - deposit;
            payable(msg.sender).send(refund); // User is responsible for accepting ETH.
        }
    }

    /// @dev Sends the deposit back to the Claimer if successful. Includes a portion of the Challenger's deposit if unsuccessfully challenged.
    /// @param _epoch The epoch associated with the claim deposit to withraw.
    function withdrawClaimDeposit(uint256 _epoch) public override {
        require(claims[_epoch].honest == Party.Claimer, "Claim unsuccessful.");

        address claimer = claims[_epoch].claimer;

        delete claims[_epoch];

        if (challengers[_epoch] != address(0)) {
            payable(BURN_ADDRESS).send(burn);
            payable(claimer).send(depositPlusReward); // User is responsible for accepting ETH.
        } else {
            payable(claimer).send(deposit); // User is responsible for accepting ETH.
        }
    }

    /// @dev Resolves the optimistic claim for '_epoch'.
    /// @param _epoch The epoch of the optimistic claim.
    function verifySnapshot(uint256 _epoch) public override OnlyBridgeRunning {
        uint256 claimTimestamp = uint256(claims[_epoch].timestamp);
        require(claimTimestamp > 0, "Invalid claim.");
        require(challengers[_epoch] == address(0), "Claim is challenged.");

        require(
            block.timestamp - claimTimestamp >= 2 * sequencerDelayLimit + sequencerFutureLimit + challengePeriod,
            "Claim must wait for sequencerDelay and challengePeriod."
        );

        if (_epoch > latestVerifiedEpoch) {
            latestVerifiedEpoch = _epoch;
            stateRoot = claims[_epoch].stateRoot;
            emit Verified(_epoch);
        }

        claims[_epoch].honest = Party.Claimer;
    }

    /// @dev Testnet operator utility function to claim, validate and withdraw.
    /// @param _epoch The epoch for which the claim is made.
    /// @param _stateroot The state root to claim.
    function devnetAdvanceState(uint256 _epoch, bytes32 _stateroot) external payable {
        claim(_epoch, _stateroot);
        verifySnapshot(_epoch);
        withdrawClaimDeposit(_epoch);
    }

    /// @dev Constructor.
    /// Note: epochPeriod must match the VeaInboxGnosisToArb contract deployment on Arbitrum, since it's on a different chain, we can't read it and trust the deployer to set a correct value
    /// @param _deposit The deposit amount to submit a claim in wei.
    /// @param _epochPeriod The duration of each epoch.
    /// @param _challengePeriod The duration of the period allowing to challenge a claim.
    /// @param _timeoutEpochs The epochs before the bridge is considered shutdown.
    /// @param _routerGnosisToArb The address of the router on Ethereum that routes from Arbitrum to Ethereum.
    /// @param _sequencerDelayLimit The maximum delay in seconds that the Arbitrum sequencer can backdate transactions.
    /// @param _sequencerFutureLimit The maximum delay in seconds that the Arbitrum sequencer can futuredate transactions.
    /// @param _maxClaimDelayEpochs The maximum number of epochs that can be claimed in the past.
    /// @param _maxClaimFutureEpochs The maximum number of epochs that can be claimed in the future.
    constructor(
        uint256 _deposit,
        uint256 _epochPeriod,
        uint256 _challengePeriod,
        uint256 _timeoutEpochs,
        address _routerGnosisToArb,
        uint256 _sequencerDelayLimit,
        uint256 _sequencerFutureLimit,
        uint256 _maxClaimDelayEpochs,
        uint256 _maxClaimFutureEpochs
    )
        VeaOutboxGnosisToArb(
            _deposit,
            _epochPeriod,
            _challengePeriod,
            _timeoutEpochs,
            _routerGnosisToArb,
            _sequencerDelayLimit,
            _sequencerFutureLimit,
            _maxClaimDelayEpochs,
            _maxClaimFutureEpochs
        )
    {
        devnetOperator = msg.sender;
    }
}
