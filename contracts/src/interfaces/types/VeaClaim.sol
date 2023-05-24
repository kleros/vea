// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

enum Party {
    None,
    Claimer,
    Challenger
}

struct Claim {
    bytes32 stateRoot;
    address claimer;
    uint32 timestamp;
    uint32 blocknumber;
    Party honest;
    address challenger;
}
