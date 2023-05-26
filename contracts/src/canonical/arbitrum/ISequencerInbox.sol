// Copyright 2021-2022, Offchain Labs, Inc.
// For license information, see https://github.com/nitro/blob/master/LICENSE
// SPDX-License-Identifier: BUSL-1.1
// https://github.com/OffchainLabs/nitro-contracts/blob/08ac127e966fa87a4d5ba3d23cd3132b57701132/src/bridge/ISequencerInbox.sol
// proxy: https://etherscan.io/address/0x1c479675ad559DC151F6Ec7ed3FbF8ceE79582B6#code
// implementation: https://etherscan.io/address/0xD03bFe2CE83632F4E618a97299cc91B1335BB2d9#code
// interface is pruned for relevant function stubs

pragma solidity 0.8.18;

import "./IBridge.sol";

interface ISequencerInbox {
    struct MaxTimeVariation {
        uint256 delayBlocks;
        uint256 futureBlocks;
        uint256 delaySeconds;
        uint256 futureSeconds;
    }

    function maxTimeVariation() external view returns (uint256, uint256, uint256, uint256);
}
