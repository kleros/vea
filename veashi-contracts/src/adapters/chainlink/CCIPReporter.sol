// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {Reporter} from "../Reporter.sol";
import {PaidReporter} from "../PaidReporter.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CCIPReporter is PaidReporter {
    using SafeERC20 for IERC20;

    string public constant PROVIDER = "ccip";

    IRouterClient public immutable CCIP_ROUTER;

    uint256 public defaultGasLimit = 200_000;
    /// @dev ERC20 used to pay CCIP fees. address(0) = pay in native.
    /// Required on chains with no native gas token (e.g. Tempo -> pathUSD).
    address public feeToken;
    mapping(uint256 => uint64) public chainSelectors;

    error ChainSelectorNotAvailable();
    error InsufficientFeeBalance(uint256 required, uint256 available);

    event ChainSelectorSet(uint256 indexed chainId, uint64 indexed chainSelector);
    event FeeTokenSet(address indexed feeToken);
    event DefaultGasLimitSet(uint256 defaultGasLimit);

    constructor(
        address yaho,
        address ccipRouter,
        address governor_,
        address keeper_
    ) Reporter(yaho, governor_, keeper_) {
        CCIP_ROUTER = IRouterClient(ccipRouter);
    }

    function setChainSelectorByChainId(uint256 chainId, uint64 chainSelector) external onlyByGovernor {
        chainSelectors[chainId] = chainSelector;
        emit ChainSelectorSet(chainId, chainSelector);
    }

    /// @notice Set the ERC20 used to pay CCIP fees. address(0) pays in native.
    function setFeeToken(address feeToken_) external onlyByGovernor {
        feeToken = feeToken_;
        emit FeeTokenSet(feeToken_);
    }

    /// @notice Destination execution gas limit. Chains that price state creation
    /// higher (e.g. Tempo TIP-1000: 250k gas per new storage slot) need this raised.
    function setDefaultGasLimit(uint256 defaultGasLimit_) external onlyByGovernorOrKeeper {
        _checkKeeperUpdate(keccak256("defaultGasLimit"), defaultGasLimit, defaultGasLimit_);
        defaultGasLimit = defaultGasLimit_;
        emit DefaultGasLimitSet(defaultGasLimit_);
    }

    function _dispatch(
        uint256 targetChainId,
        address adapter,
        uint256[] memory ids,
        bytes32[] memory hashes
    ) internal override returns (bytes32) {
        uint64 targetChainSelector = chainSelectors[targetChainId];
        if (targetChainSelector == 0) revert ChainSelectorNotAvailable();
        bytes memory payload = abi.encode(ids, hashes);
        address feeToken_ = feeToken;
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(adapter),
            data: payload,
            tokenAmounts: new Client.EVMTokenAmount[](0), // Empty array - no tokens are transferred
            // V2 with out-of-order execution allowed, which lanes that enforce it require: each message
            // stores independent ids and hashes and Yaru executes by id, so delivery order does not matter.
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: defaultGasLimit, allowOutOfOrderExecution: true})
            ),
            feeToken: feeToken_ // address(0) = native, otherwise an ERC20 accepted by the router
        });

        uint256 fees = CCIP_ROUTER.getFee(targetChainSelector, message);

        bytes32 messageId;
        if (feeToken_ == address(0)) {
            uint256 available = address(this).balance;
            if (fees > available) revert InsufficientFeeBalance(fees, available);
            messageId = CCIP_ROUTER.ccipSend{value: fees}(targetChainSelector, message);
        } else {
            uint256 available = IERC20(feeToken_).balanceOf(address(this));
            if (fees > available) revert InsufficientFeeBalance(fees, available);
            IERC20(feeToken_).forceApprove(address(CCIP_ROUTER), fees);
            messageId = CCIP_ROUTER.ccipSend(targetChainSelector, message);
        }
        return messageId;
    }
}
