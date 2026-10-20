// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {DeploymentState} from "./DeploymentState.sol";

/// @dev Destination gas for the bridges that let the reporter choose it (LayerZero lzReceive, CCIP ccipReceive).
/// An adapter stores each hash in a new storage slot, so the gas must cover that on the ADAPTER chain.
abstract contract DestinationGas is DeploymentState {
    /// @dev Tempo (TIP-1000) charges 250k gas per new storage slot. Keep this list equal to AUTO_MULT_CHAINS in
    /// script/deploy-route.sh.
    uint256 internal constant TEMPO_CHAIN_ID = 4217;

    /// @dev About two new slots (the adapter's hash and LayerZero's first inbound nonce) plus overhead; the live
    /// Ethereum -> Tempo LayerZero reporter runs 600000.
    uint256 internal constant MIN_REPRICED_DEST_GAS = 600_000;

    function _isRepricedChain(uint256 chainId) internal pure returns (bool) {
        return chainId == TEMPO_CHAIN_ID;
    }

    /// @dev Chains with no native value transfer, where a CCIP reporter must pay in an ERC20 fee token.
    function _requiresFeeToken(uint256 chainId) internal pure returns (bool) {
        return chainId == TEMPO_CHAIN_ID;
    }

    function _checkDestGas(string memory key, uint256 gasLimit) internal view {
        require(gasLimit != 0, string.concat(key, " must be nonzero"));
        if (_isRepricedChain(ADAPTER_CHAIN_ID) && gasLimit < MIN_REPRICED_DEST_GAS) {
            string memory problem = string.concat(
                key,
                " ",
                vm.toString(gasLimit),
                " is below ",
                vm.toString(MIN_REPRICED_DEST_GAS),
                " into chain ",
                vm.toString(ADAPTER_CHAIN_ID),
                " (250k gas per new storage slot)"
            );
            require(
                _envFlag("ALLOW_LOW_DEST_GAS"),
                string.concat(problem, "; set ALLOW_LOW_DEST_GAS=true to accept it")
            );
            console.log("WARNING:", problem);
        }
    }

    /// @dev LZ_GAS_LIMIT: the gas LayerZero's executor gives lzReceive on the adapter chain.
    function _lzGasLimit() internal view returns (uint128) {
        require(
            !_envSet("LZ_DEFAULT_FEE"),
            "LZ_DEFAULT_FEE was renamed to LZ_GAS_LIMIT (destination lzReceive gas units, not a fee)"
        );
        uint256 gasLimit = _envUintRequired("LZ_GAS_LIMIT");
        require(gasLimit <= type(uint128).max, "LZ_GAS_LIMIT exceeds uint128");
        _checkDestGas("LZ_GAS_LIMIT", gasLimit);
        return uint128(gasLimit);
    }

    /// @dev CCIP_GAS_LIMIT: optional (the reporter defaults to 200000), required into a repriced chain.
    function _ccipGasLimit() internal view returns (bool set, uint256 gasLimit) {
        if (!_envSet("CCIP_GAS_LIMIT")) {
            require(
                !_isRepricedChain(ADAPTER_CHAIN_ID),
                string.concat(
                    "CCIP_GAS_LIMIT is required into chain ",
                    vm.toString(ADAPTER_CHAIN_ID),
                    " (the 200000 default cannot store one hash there)"
                )
            );
            return (false, 0);
        }
        gasLimit = vm.envUint("CCIP_GAS_LIMIT");
        _checkDestGas("CCIP_GAS_LIMIT", gasLimit);
        return (true, gasLimit);
    }
}
