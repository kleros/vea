// https://github.com/OffchainLabs/nitro-contracts/blob/08ac127e966fa87a4d5ba3d23cd3132b57701132/src/bridge/IInbox.sol
// proxy: https://etherscan.io/address/0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f
// implementation: https://etherscan.io/address/0x5aed5f8a1e3607476f1f81c3d8fe126deb0afe94
// interface is pruned for relevant function stubs

pragma solidity 0.8.18;

import "./IBridge.sol";

interface IInbox {
    function bridge() external view returns (IBridge);
}
