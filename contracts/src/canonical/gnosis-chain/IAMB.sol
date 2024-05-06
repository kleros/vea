// https://docs.gnosischain.com/bridges/tokenbridge/amb-bridge#gnosis
// https://github.com/omni/tokenbridge-contracts/blob/908a48107919d4ab127f9af07d44d47eac91547e/contracts/interfaces/IAMB.sol
// interface is pruned for relevant function stubs

pragma solidity 0.8.24;

interface IAMB {
    function requireToPassMessage(address _contract, bytes memory _data, uint256 _gas) external returns (bytes32);

    function maxGasPerTx() external view returns (uint256);

    function messageSender() external view returns (address);

    function messageSourceChainId() external view returns (bytes32);
}
