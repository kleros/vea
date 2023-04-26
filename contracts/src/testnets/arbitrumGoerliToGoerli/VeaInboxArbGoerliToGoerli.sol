// SPDX-License-Identifier: MIT

/**
 *  @authors: [@jaybuidl, @shotaronowhere]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.18;

import "../../canonical/arbitrum/IArbSys.sol";
import "../../interfaces/IVeaInbox.sol";
import "./interfaces/IVeaOutboxArbGoerliToGoerli.sol";

/**
 * Vea Bridge Inbox From Arbitrum to Ethereum.
 */
contract VeaInboxArbGoerliToGoerli is IVeaInbox {
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

    /**
     * @dev Relayers watch for these events to construct merkle proofs to execute transactions on Ethereum.
     * @param nodeData The data to create leaves in the merkle tree. abi.encodePacked(msgId, to, data), outbox relays to.call(data)
     */
    event MessageSent(bytes nodeData);

    /**
     * The bridgers can watch this event to claim the stateRoot on the veaOutbox.
     * @param count The count of messages in the merkle tree
     */
    event SnapshotSaved(uint256 count);

    /**
     * @dev The event is emitted when a snapshot through the canonical arbiturm bridge.
     * @param epochSent The epoch of the snapshot.
     * @param ticketId The ticketId of the L2->L1 message.
     */
    event SnapshotSent(uint256 indexed epochSent, bytes32 ticketId);

    IArbSys public constant ARB_SYS = IArbSys(address(100));

    uint256 public immutable epochPeriod; // Epochs mark the period between stateroot snapshots
    address public immutable veaOutbox; // The vea outbox on ethereum.

    mapping(uint256 => bytes32) public snapshots; // epoch => state root snapshot

    // inbox represents minimum data availability to maintain incremental merkle tree.
    // supports a max of 2^64 - 1 messages and will *never* overflow, see parameter docs.

    bytes32[64] public inbox; // stores minimal set of complete subtree roots of the merkle tree to increment.
    uint256 public count; // count of messages in the merkle tree

    /**
     * @dev Constructor.
     * @param _epochPeriod The duration in seconds between epochs.
     * @param _veaOutbox The veaOutbox on ethereum.
     */
    constructor(uint256 _epochPeriod, address _veaOutbox) {
        epochPeriod = _epochPeriod;
        veaOutbox = _veaOutbox;
    }

    /**
     * @dev Sends an arbitrary message to a receiving chain.
     * `O(log(count))` where count is the number of messages already sent.
     * Note: Amortized cost is O(1).
     * @param to The address of the contract on the receiving chain which receives the calldata.
     * @param fnSelector The function selector of the receiving contract.
     * @param data The message calldata, abi.encode(param1, param2, ...)
     * @return msgId The zero based index of the message in the inbox.
     */
    function sendMessage(address to, bytes4 fnSelector, bytes memory data) external override returns (uint64) {
        uint256 oldCount = count;

        bytes memory nodeData = abi.encodePacked(
            uint64(oldCount),
            to,
            // data for outbox relay
            abi.encodePacked( // abi.encodeWithSelector(fnSelector, msg.sender, data)
                fnSelector,
                bytes32(uint256(uint160(msg.sender))), // big endian padded encoding of msg.sender, simulating abi.encodeWithSelector
                data
            )
        );

        // single hashed leaf
        bytes32 newInboxNode = keccak256(nodeData);

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

        emit MessageSent(nodeData);

        // old count is the zero indexed leaf position in the tree, acts as a msgId
        // gateways should index these msgIds to later relay proofs
        return uint64(oldCount);
    }

    /**
     * Saves snapshot of state root.
     * `O(log(count))` where count number of messages in the inbox.
     * @dev Snapshots can be saved a maximum of once per epoch.
     */
    function saveSnapshot() external {
        uint256 epoch;
        bytes32 stateRoot;

        unchecked {
            epoch = block.timestamp / epochPeriod;

            require(snapshots[epoch] == bytes32(0), "Snapshot already taken for this epoch.");

            // calculate the current root of the incremental merkle tree encoded in the inbox

            uint256 height;

            // x acts as a bit mask to determine if the hash stored in the inbox contributes to the root
            uint256 x;

            // x is bit shifted to the right each loop, hence this loop will always terminate in a maximum of log_2(count) iterations
            for (x = count; x > 0; x = x >> 1) {
                if ((x & 1) == 1) {
                    // first hash is special case
                    // inbox stores the root of complete subtrees
                    // eg if count = 4 = 0b100, then the first complete subtree is inbox[2]
                    // inbox = [H(m_3), H(H(m_1),H(m_2)) H(H(H(m_1),H(m_2)),H(H(m_3),H(m_4)))], we read inbox[2] directly

                    stateRoot = inbox[height];
                    break;
                }
                height++;
            }

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

        emit SnapshotSaved(count);
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
     * @param epochSend The epoch of the snapshot requested to send.
     */
    function sendSnapshot(uint256 epochSend, Claim calldata claim) external virtual {
        unchecked {
            require(epochSend < block.timestamp / epochPeriod, "Can only send past epoch snapshot.");
        }

        bytes memory data = abi.encodeWithSelector(
            IVeaOutboxArbGoerliToGoerli.resolveDisputedClaim.selector,
            epochSend,
            snapshots[epochSend],
            claim
        );

        bytes32 ticketID = bytes32(ARB_SYS.sendTxToL1(veaOutbox, data));

        emit SnapshotSent(epochSend, ticketID);
    }
}
