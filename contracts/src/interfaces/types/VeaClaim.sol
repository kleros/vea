// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.24;

enum Party {
    None,
    Claimer,
    Challenger
}

struct Claim {
    bytes32 stateRoot;
    address claimer;
    uint32 timestampClaimed;
    uint32 timestampVerification;
    uint32 blocknumberVerification;
    Party honest;
    address challenger;
}
