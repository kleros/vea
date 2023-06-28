// SPDX-License-Identifier: MIT

/// @custom:authors: [@jaybuidl, @shotaronowhere]
/// @custom:reviewers: []
/// @custom:auditors: []
/// @custom:bounties: []
/// @custom:deployments: []

pragma solidity 0.8.18;

import "../canonical/gnosis-chain/IAMB.sol";
import "../interfaces/inboxes/IVeaInbox.sol";
import "../interfaces/routers/IRouterToArb.sol";

/// @dev Vea Inbox From Gnosis to Arbitrum.
/// Note: This contract is deployed on the Gnosis.
contract VeaInboxGnosisToArb is IVeaInbox {
    // ************************************* //
    // *             Storage               * //
    // ************************************* //

    IAMB public immutable amb; // The address of the AMB contract on Gnosis.

    uint256 public immutable epochPeriod; // Epochs mark the period between stateroot snapshots
    address public immutable routerGnosisToArb; // The router on Ethereum.

    mapping(uint256 => bytes32) public snapshots; // epoch => state root snapshot

    // Inbox represents minimum data availability to maintain incremental merkle tree.
    // Supports a max of 2^64 - 1 messages. See merkle tree docs for details how inbox manages state.

    bytes32[64] public inbox; // stores minimal set of complete subtree roots of the merkle tree to increment.
    uint64 public count; // count of messages in the merkle tree

    // ************************************* //
    // *              Events               * //
    // ************************************* //

    /// @dev Relayers watch for these events to construct merkle proofs to execute transactions on Ethereum.
    /// @param _nodeData The data to create leaves in the merkle tree. abi.encodePacked(msgId, to, message), outbox relays to.call(message)
    event MessageSent(bytes _nodeData);

    /// The bridgers can watch this event to claim the stateRoot on the veaOutbox.
    /// @param _count The count of messages in the merkle tree.
    event SnapshotSaved(uint64 _count);

    /// @dev The event is emitted when a snapshot is sent through the canonical arbitrum bridge.
    /// @param _epochSent The epoch of the snapshot.
    /// @param _ticketId The ticketId of the L2->L1 message.
    event SnapshotSent(uint256 indexed _epochSent, bytes32 _ticketId);

    /// @dev Constructor.
    /// Note: epochPeriod must match the VeaOutboxGnosisToArb contract deployment on Gnosis, since it's on a different chain, we can't read it and trust the deployer to set a correct value
    /// @param _epochPeriod The duration in seconds between epochs.
    /// @param _routerGnosisToArb The router on Ethereum that routes from Gnosis to Arbitrum.
    /// @param _amb The address of the AMB contract on Gnosis.
    constructor(uint256 _epochPeriod, address _routerGnosisToArb, IAMB _amb) {
        epochPeriod = _epochPeriod;
        routerGnosisToArb = _routerGnosisToArb;
        amb = _amb;
    }

    // ************************************* //
    // *         State Modifiers           * //
    // ************************************* //

    /// @dev Sends an arbitrary message to Gnosis.
    ///      `O(log(count))` where count is the number of messages already sent.
    ///      Amortized cost is constant.
    /// Note: See merkle tree documentation for details how inbox manages state.
    /// @param _to The address of the contract on the receiving chain which receives the calldata.
    /// @param _fnSelector The function selector of the receiving contract.
    /// @param _data The message calldata, abi.encode(param1, param2, ...)
    /// @return msgId The zero based index of the message in the inbox.
    function sendMessage(address _to, bytes4 _fnSelector, bytes memory _data) external override returns (uint64) {
        uint64 oldCount = count;

        // Given arbitrum's speed limit of 7 million gas / second, it would take atleast 8 million years of full blocks to overflow.
        // It *should* be impossible to overflow, but we check to be safe when appending to the tree.
        require(oldCount < type(uint64).max, "Inbox is full.");

        bytes memory nodeData = abi.encodePacked(
            oldCount,
            _to,
            // data for outbox relay
            abi.encodePacked( // abi.encodeWithSelector(fnSelector, msg.sender, param1, param2, ...) where _data is abi.encode(param1, param2, ...)
                _fnSelector,
                bytes32(uint256(uint160(msg.sender))), // big endian padded encoding of msg.sender, simulating abi.encodeWithSelector
                _data
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
            for (uint64 x = oldCount + 1; x & 1 == 0; x = x >> 1) {
                // sort sibling hashes as a convention for efficient proof validation
                newInboxNode = sortConcatAndHash(inbox[height], newInboxNode);
                height++;
            }

            inbox[height] = newInboxNode;

            // finally increment count
            count = oldCount + 1;
        }

        emit MessageSent(nodeData);

        // old count is the zero indexed leaf position in the tree, acts as a msgId
        // gateways should index these msgIds to later relay proofs
        return oldCount;
    }

    /// @dev Saves snapshot of state root. Snapshots can be saved a maximum of once per epoch.
    ///      `O(log(count))` where count number of messages in the inbox.
    /// Note: See merkle tree docs for details how inbox manages state.
    function saveSnapshot() external {
        uint256 epoch;
        bytes32 stateRoot;

        unchecked {
            epoch = block.timestamp / epochPeriod;

            // calculate the current root of the incremental merkle tree encoded in the inbox

            uint256 height;

            // x acts as a bit mask to determine if the hash stored in the inbox contributes to the root
            uint256 x;

            // x is bit shifted to the right each loop, hence this loop will always terminate in a maximum of log_2(count) iterations
            for (x = uint256(count); x > 0; x = x >> 1) {
                if ((x & 1) == 1) {
                    // first hash is special case
                    // inbox stores the root of complete subtrees
                    // eg if count = 4 = 0b100, then the first complete subtree is inbox[2]
                    // inbox = [H(3), H(1,2), H(1,4)], we read inbox[2] directly

                    stateRoot = inbox[height];
                    break;
                }
                height++;
            }

            // after the first hash, we can calculate the root incrementally
            for (x = x >> 1; x > 0; x = x >> 1) {
                height++;
                if ((x & 1) == 1) {
                    // sort sibling hashes as a convention for efficient proof validation
                    stateRoot = sortConcatAndHash(inbox[height], stateRoot);
                }
            }
        }

        snapshots[epoch] = stateRoot;

        emit SnapshotSaved(count);
    }

    /// @dev Helper function to calculate merkle tree interior nodes by sorting and concatenating and hashing a pair of children nodes, left and right.
    /// Note: EVM scratch space is used to efficiently calculate hashes.
    /// @param _left The left hash.
    /// @param _right The right hash.
    /// @return parent The parent hash.
    function sortConcatAndHash(bytes32 _left, bytes32 _right) internal pure returns (bytes32 parent) {
        // sort sibling hashes as a convention for efficient proof validation
        if (_left < _right) {
            // efficient hash using EVM scratch space
            assembly {
                mstore(0x00, _left)
                mstore(0x20, _right)
                parent := keccak256(0x00, 0x40)
            }
        } else {
            assembly {
                mstore(0x00, _right)
                mstore(0x20, _left)
                parent := keccak256(0x00, 0x40)
            }
        }
    }

    /// @dev Sends the state root snapshot using Arbitrum's canonical bridge.
    /// @param _epoch The epoch of the snapshot requested to send.
    /// @param _inboxIndex The index of the inbox in the Arbitrum bridge contract.
    /// @param _maxSubmissionCost Max gas deducted from user's L2 balance to cover base submission fee
    /// @param _excessFeeRefundAddress Address to refund any excess fee to
    /// @param _gasLimit Max gas deducted from user's L2 balance to cover L2 execution. Should not be set to 1 (magic value used to trigger the RetryableData error)
    /// @param _maxFeePerGas price bid for L2 execution. Should not be set to 1 (magic value used to trigger the RetryableData error)
    function sendSnapshot(
        uint256 _epoch,
        uint256 _inboxIndex,
        uint256 _maxSubmissionCost,
        address _excessFeeRefundAddress,
        uint256 _gasLimit,
        uint256 _maxFeePerGas
    ) external virtual returns (bytes32 ticketID) {
        unchecked {
            require(_epoch < block.timestamp / epochPeriod, "Can only send past epoch snapshot.");
        }

        bytes memory data = abi.encodeCall(
            IRouterToArb.route,
            (
                _epoch,
                snapshots[_epoch],
                _inboxIndex,
                _maxSubmissionCost,
                _excessFeeRefundAddress,
                _gasLimit,
                _maxFeePerGas
            )
        );
        // Note: using maxGasPerTx here means the relaying txn on Gnosis will need to pass that (large) amount of gas, though almost all will be unused and refunded. This is preferred over hardcoding a gas limit.
        ticketID = amb.requireToPassMessage(routerGnosisToArb, data, amb.maxGasPerTx());

        emit SnapshotSent(_epoch, ticketID);
    }
}
