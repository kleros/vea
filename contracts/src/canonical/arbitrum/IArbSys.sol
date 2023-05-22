// https://developer.arbitrum.io/arbos/precompiles#arbsys
// https://github.com/OffchainLabs/nitro-contracts/blob/39ea5a163afc637e2706d9be29cf7a289c300d00/src/precompiles/ArbSys.sol
// https://arbiscan.io/address/0x0000000000000000000000000000000000000064#code
// interface is pruned for relevant function stubs

pragma solidity 0.8.18;

/**
 * @title System level functionality
 * @notice For use by contracts to interact with core L2-specific functionality.
 * Precompiled contract that exists in every Arbitrum chain at address(100), 0x0000000000000000000000000000000000000064.
 */
interface IArbSys {
    /**
     * @notice Send a transaction to L1
     * @dev it is not possible to execute on the L1 any L2-to-L1 transaction which contains data
     * to a contract address without any code (as enforced by the Bridge contract).
     * @param destination recipient address on L1
     * @param data (optional) calldata for L1 contract call
     * @return a unique identifier for this L2-to-L1 transaction.
     */
    function sendTxToL1(address destination, bytes calldata data) external payable returns (uint256);
}
