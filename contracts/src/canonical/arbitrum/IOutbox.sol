// https://github.com/OffchainLabs/nitro-contracts/blob/08ac127e966fa87a4d5ba3d23cd3132b57701132/src/bridge/IBridge.sol
// proxy: https://etherscan.io/address/0x0B9857ae2D4A3DBe74ffE1d7DF045bb7F96E4840#code
// implementation: https://etherscan.io/address/0x0ea7372338a589e7f0b00e463a53aa464ef04e17#code
// interface is pruned for relevant function stubs

pragma solidity 0.8.18;

interface IOutbox {
    /// @notice When l2ToL1Sender returns a nonzero address, the message was originated by an L2 account
    ///         When the return value is zero, that means this is a system message
    /// @dev the l2ToL1Sender behaves as the tx.origin, the msg.sender should be validated to protect against reentrancies
    function l2ToL1Sender() external view returns (address);
}
