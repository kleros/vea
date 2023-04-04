// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.0;

import "./canonical/arbitrum/IArbSys.sol";
import "./interfaces/IVeaInbox.sol";
import "./interfaces/IVeaOutbox.sol";

contract VeaInbox is IVeaInbox {
    /**
     * @dev Relayers watch for these events to construct merkle proofs to execute transactions on Gnosis Chain.
     * @param msgData abi.encode(msgId, msg.sender, to, data);
     */
    event MessageSent(bytes msgData);

    /**
     * The bridgers need to watch for these events and relay the
     * stateRoot on the veaOutbox.
     * @param epoch The epoch of the batch requested to send.
     * @param stateRoot The receiving domain encoded message data.
     */
    event SnapshotSaved(uint64 indexed epoch, bytes32 stateRoot);

    /**
     * @dev The event is emitted when messages are sent through the canonical arbiturm bridge.
     * @param epoch The epoch of the batch requested to send.
     * @param stateRoot The state root of batched messages.
     */
    event StaterootSent(uint64 indexed epoch, bytes32 stateRoot);

    IArbSys public constant ARB_SYS = IArbSys(address(100));
    uint64 public immutable epochPeriod; // Epochs mark the period between stateroot snapshots
    address public immutable receiver; // The receiver on ethereum.

    mapping(uint256 => bytes32) public stateRootSnapshots; // epoch => state root snapshot
    bytes32[64] public inbox;
    uint64 count; // max 2^64 messages

    /**
     * @dev Constructor.
     * @param _epochPeriod The duration between epochs.
     * @param _receiver The receiver on ethereum.
     */
    constructor(uint64 _epochPeriod, address _receiver) {
        epochPeriod = _epochPeriod;
        receiver = _receiver;
    }

    /**
     * @dev Sends the state root using Arbitrum's canonical bridge.
     * @param epochSend The epoch of the batch requested to send.
     */
    function sendStaterootSnapshot(uint64 epochSend) external virtual {
        uint64 epoch = uint64(block.timestamp) / epochPeriod;
        require(epochSend <= epoch, "Epoch in the future.");
        bytes memory data = abi.encodeWithSelector(
            IChallengeResolver.resolveChallenge.selector,
            epoch,
            stateRootSnapshots[epochSend]
        );

        bytes32 ticketID = bytes32(ARB_SYS.sendTxToL1(receiver, data));

        emit StaterootSent(epochSend, ticketID);
    }

    /**
     * @dev Sends an arbitrary message to a receiving chain.
     * @param to The address of the contract on the receiving chain which receives the calldata.
     * @param data The message calldata, abi.encodeWithSelector(...)
     * @return msgId The message id, 0 indexed.
     */
    function sendMsg(address to, bytes calldata data) external override returns (uint64) {
        uint64 oldCount = count;
        uint64 newCount = oldCount + 1;

        bytes memory msgData = abi.encodePacked(oldCount, msg.sender, to, data);

        // Double Hash all leaves
        bytes32 leaf = keccak256(abi.encode(keccak256(msgData)));

        // Efficiently calculate the new root
        uint64 hashBitField = (newCount ^ (oldCount)) & newCount;
        uint64 height;

        while ((hashBitField & 1) == 0) {
            bytes32 node = inbox[height];
            if (node > leaf)
                assembly {
                    mstore(0x00, leaf)
                    mstore(0x20, node)
                    leaf := keccak256(0x00, 0x40)
                }
            else
                assembly {
                    mstore(0x00, node)
                    mstore(0x20, leaf)
                    leaf := keccak256(0x00, 0x40)
                }
            unchecked {
                hashBitField /= 2;
                height++;
            }
        }
        inbox[height] = leaf;

        count = newCount;

        emit MessageSent(msgData);

        // old count is the zero indexed leaf position in the tree, acts as a msgId
        // gateways should index these msgIds to later relay proofs
        return oldCount;
    }

    /**
     * Takes snapshot of state root.
     * @dev Snapshots can be saved a maximum of once per epoch.
     */
    function saveStateRootSnapshot() external {
        uint64 epoch = uint64(block.timestamp) / epochPeriod;
        require(stateRootSnapshots[epoch] == bytes32(0), "Snapshot already taken for this epoch.");
        bytes32 stateRoot = getStateroot();
        stateRootSnapshots[epoch] = stateRoot;

        emit SnapshotSaved(epoch, stateRoot);
    }

    /**
     * @dev Gets the current state root.
     *  `O(log(n))` where `n` is the number of leaves.
     *  Note: Inlined from `merkle/MerkleTree.sol` for performance.
     */
    function getStateroot() internal view returns (bytes32 node) {
        uint64 size = count;
        uint64 height;
        bool isFirstHash = true;
        while (size > 0) {
            if ((size & 1) == 1) {
                // avoid redundant calculation
                if (isFirstHash) {
                    node = inbox[height];
                    isFirstHash = false;
                } else {
                    bytes32 hash = inbox[height];
                    // efficient hash
                    if (hash > node)
                        assembly {
                            mstore(0x00, node)
                            mstore(0x20, hash)
                            node := keccak256(0x00, 0x40)
                        }
                    else
                        assembly {
                            mstore(0x00, hash)
                            mstore(0x20, node)
                            node := keccak256(0x00, 0x40)
                        }
                }
            }
            unchecked {
                size /= 2;
                height++;
            }
        }
    }
}
