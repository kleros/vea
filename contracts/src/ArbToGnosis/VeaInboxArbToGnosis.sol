// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../canonical/arbitrum/IArbSys.sol";
import "../interfaces/IVeaInbox.sol";
import "../interfaces/IVeaOutbox.sol";
import "../interfaces/IRouter.sol";

/**
 * Vea Bridge Outbox From Arbitrum to Gnosis.
 */
contract VeaInboxArbToGnosis is IVeaInbox {
    /**
     * @dev Relayers watch for these events to construct merkle proofs to execute transactions on Ethereum.
     * @param msgId The zero based index of the message in the inbox.
     * @param to The address to call.
     * @param msgData The message to relay. eg to.call(msgData)
     */
    event MessageSent(uint64 msgId, address to, bytes msgData);

    /**
     * The bridgers watch this event to claim the stateRoot on the veaOutbox.
     * The epoch (not emitted) is determined by block.timestamp / epochPeriod.
     * @param stateRoot The receiving domain encoded message data.
     */
    event SnapshotSaved(bytes32 stateRoot);

    /**
     * @dev The event is emitted when a snapshot through the canonical arbiturm bridge.
     * @param epochSent The epoch of the snapshot.
     * @param ticketId The ticketId of the L2->L1 message.
     */
    event SnapshotSent(uint256 epochSent, bytes32 ticketId);

    /**
     * @dev The event is emitted when a heartbeat is sent.
     * @param ticketId The ticketId of the L2->L1 message.
     */
    event Hearbeat(bytes32 ticketId);

    IArbSys public constant ARB_SYS = IArbSys(address(100));
    uint256 public immutable epochPeriod; // Epochs mark the period between stateroot snapshots
    address public immutable routerArbToGnosis; // The router from arbitrum to gnosis on ethereum.

    mapping(uint256 => bytes32) public snapshots; // epoch => state root snapshot

    // inbox represents minimum data availability to maintain incremental merkle tree.
    // supports a max of 2^64 - 1 messages and will *never* overflow, see parameter docs.

    bytes32[64] public inbox; // stores minimal set of complete subtree roots of the merkle tree to increment.
    uint256 public count; // count of messages in the merkle tree

    /**
     * @dev Constructor.
     * @param _epochPeriod The duration in seconds between epochs.
     * @param _routerArbToGnosis The router from arbitrum to gnosis on ethereum.
     */
    constructor(uint256 _epochPeriod, address _routerArbToGnosis) {
        epochPeriod = _epochPeriod;
        routerArbToGnosis = _routerArbToGnosis;
    }

    /**
     * @dev Sends an arbitrary message to a receiving chain.
     * @param to The address of the contract on the receiving chain which receives the calldata.
     * @param fnSelector The function selector of the receiving contract.
     * @param data The message calldata, abi.encode(param1, param2, ...)
     * @return msgId The zero based index of the message in the inbox.
     */
    function sendMessage(address to, bytes4 fnSelector, bytes calldata data) external override returns (uint64) {
        uint256 oldCount = count;

        // big endian padded encoding of msg.sender, simulating abi.encodeWithSelector
        bytes memory msgData = abi.encodePacked(fnSelector, bytes32(uint256(uint160(msg.sender))), data);

        // single hashed leaf
        bytes32 newInboxNode = keccak256(abi.encodePacked(uint64(oldCount), to, msgData));

        // double hashed leaf
        // avoids second order preimage attacks
        // https://flawed.net.nz/2018/02/21/attacking-merkle-trees-with-a-second-preimage-attack/
        assembly {
            // efficient hash using EVM scratch space
            mstore(0x00, newInboxNode)
            newInboxNode := keccak256(0x00, 0x20)
        }

        // increment merkle tree calculating minimal number of hashes
        unchecked {
            uint256 height;

            // x = oldCount + 1; acts as a bit mask to determine if a hash is needed
            // note: x is always non-zero, and x is bit shifted to the right each loop
            // hence this loop will always terminate in a maximum of log_2(oldCount + 1) iterations
            for (uint256 x = oldCount + 1; x & 1 == 0; x = x >> 1) {
                bytes32 oldInboxNode = inbox[height];
                // sort sibling hashes as a convention for efficient proof validation
                newInboxNode = sortConcatAndHash(oldInboxNode, newInboxNode);
                height++;
            }

            inbox[height] = newInboxNode;

            // finally increment count
            count = oldCount + 1;
        }

        emit MessageSent(uint64(oldCount), to, msgData);

        // old count is the zero indexed leaf position in the tree, acts as a msgId
        // gateways should index these msgIds to later relay proofs
        return uint64(oldCount);
    }

    /**
     * Saves snapshot of state root.
     * @dev Snapshots can be saved a maximum of once per epoch.
     */
    function saveSnapshot() external {
        uint256 epoch;
        bytes32 stateRoot;

        unchecked {
            epoch = block.timestamp / epochPeriod;

            require(snapshots[epoch] == bytes32(0), "Snapshot already taken for this epoch.");

            // calculate the current root of the incremental merkle tree encoded in the inbox

            // first hash is special case
            // inbox already stores the root of complete subtrees
            // so we can skip calculating the root of the first complete subtree
            // eg inbox = [H(m_1), H(H(m_1),H(m_2))], we can skip inbox[0] and read inbox[1] directly

            uint256 height;
            uint256 x;

            // x acts as a bit mask to determine if the hash stored in the inbox contributes to the root
            // x is bit shifted to the right each loop, hence this loop will always terminate in a maximum of log_2(count) iterations
            for (x = count; x > 0; x = x >> 1) {
                if ((x & 1) == 1) {
                    stateRoot = inbox[height];
                    break;
                }
                height++;
            }

            // x is right bit shifted by 1 since this was skipped in the break condition

            for (x = x >> 1; x > 0; x = x >> 1) {
                height++;
                if ((x & 1) == 1) {
                    bytes32 inboxHash = inbox[height];
                    // sort sibling hashes as a convention for efficient proof validation
                    stateRoot = sortConcatAndHash(inboxHash, stateRoot);
                }
            }
        }

        snapshots[epoch] = stateRoot;

        emit SnapshotSaved(stateRoot);
    }

    /**
     * @dev Helper function to calculate merkle tree interior nodes by sorting and concatenating and hashing sibling hashes.
     * note: EVM scratch space is used to efficiently calculate hashes.
     * @param child_1 The first sibling hash.
     * @param child_2 The second sibling hash.
     * @return parent The parent hash.
     */
    function sortConcatAndHash(bytes32 child_1, bytes32 child_2) internal pure returns (bytes32 parent) {
        // sort sibling hashes as a convention for efficient proof validation
        // efficient hash using EVM scratch space
        if (child_1 > child_2) {
            assembly {
                mstore(0x00, child_2)
                mstore(0x20, child_1)
                parent := keccak256(0x00, 0x40)
            }
        } else {
            assembly {
                mstore(0x00, child_1)
                mstore(0x20, child_2)
                parent := keccak256(0x00, 0x40)
            }
        }
    }

    /**
     * @dev Sends the state root snapshot using Arbitrum's canonical bridge.
     * @param epochSend The epoch of the batch requested to send.
     */
    function sendSnapshot(uint256 epochSend) external virtual {
        uint256 epochNow;
        unchecked {
            epochNow = uint256(block.timestamp) / epochPeriod;
        }

        require(epochSend < epochNow, "Cannot send stateroot for current or future epoch.");

        bytes memory data = abi.encodeCall(IRouter.route, (epochSend, snapshots[epochSend]));

        bytes32 ticketID = bytes32(ARB_SYS.sendTxToL1(routerArbToGnosis, data));

        emit SnapshotSent(epochSend, ticketID);
    }

    /**
     * @dev Sends heartbeat to VeaOutbox.
     */
    function sendHeartbeat() external virtual {
        bytes memory data = abi.encodeCall(IVeaOutbox.heartbeat, block.timestamp);

        bytes32 ticketID = bytes32(ARB_SYS.sendTxToL1(routerArbToGnosis, data));

        emit Hearbeat(ticketID);
    }
}
