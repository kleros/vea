// SPDX-License-Identifier: BUSL-1.1
// https://github.com/OffchainLabs/nitro-contracts/blob/08ac127e966fa87a4d5ba3d23cd3132b57701132/src/bridge/IBridge.sol
// proxy: https://etherscan.io/address/0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a
// implementation: https://etherscan.io/address/0x1066cecc8880948fe55e427e94f1ff221d626591#code
// interface is pruned for relevant function stubs

pragma solidity 0.8.18;

interface IBridge {
    function activeOutbox() external view returns (address);

    function sequencerInbox() external view returns (address);

    function allowedDelayedInboxList(uint256) external returns (address);
}
