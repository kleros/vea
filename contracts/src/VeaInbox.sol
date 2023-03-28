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
     * @param fastMessage The fast message data.
     */
    event MessageSent(bytes fastMessage);

    /**
     * The bridgers need to watch for these events and relay the
     * stateRoot on the FastBridgeReceiver.
     * @param epoch The epoch of the batch requested to send.
     * @param stateRoot The receiving domain encoded message data.
     */
    event SnapshotSaved(uint256 indexed epoch, bytes32 stateRoot);

    /**
     * @dev The event is emitted when messages are sent through the canonical arbiturm bridge.
     * @param epoch The epoch of the batch requested to send.
     * @param stateRoot The state root of batched messages.
     */
    event StaterootSent(uint256 indexed epoch, bytes32 stateRoot);

    IArbSys public constant ARB_SYS = IArbSys(address(100));
    uint256 public immutable epochPeriod; // Epochs mark the period between stateroot snapshots
    address public immutable receiver; // The receiver on ethereum.

    mapping(uint256 => bytes32) public stateRootSnapshots; // epoch => state root snapshot
    bytes32[64] public inbox;
    uint256 count; // max 2^64 messages

    /**
     * @dev Constructor.
     * @param _epochPeriod The duration between epochs.
     * @param _receiver The receiver on ethereum.
     */
    constructor(uint256 _epochPeriod, address _receiver) {
        epochPeriod = _epochPeriod;
        receiver = _receiver;
    }

    /**
     * @dev Sends the state root using Arbitrum's canonical bridge.
     */
    function sendStaterootSnapshot(uint256 _epochSnapshot) external virtual {
        uint256 epoch = block.timestamp / epochPeriod;
        require(_epochSnapshot <= epoch, "Epoch in the future.");
        bytes memory data = abi.encodeWithSelector(
            IVeaOutbox.resolveChallenge.selector,
            epoch,
            stateRootSnapshots[_epochSnapshot]
        );

        bytes32 ticketID = bytes32(ARB_SYS.sendTxToL1(receiver, data));

        emit StaterootSent(_epochSnapshot, ticketID);
    }

    /**
     * @dev Sends an arbitrary message to a receiving chain.
     * @param _to The address of the contract on the receiving chain which receives the calldata.
     * @param _data The message calldata, abi.encodeWithSelector(...)
     * @return msgId The message id, 1 indexed.
     */
    function sendMsg(address _to, bytes memory _data) external returns (uint256 msgId) {
        // Encode the receiver address with the function signature + arguments i.e calldata
        (bytes32 leaf, bytes memory message) = _encode(_to, _data);
        msgId = appendMessage(leaf);
        emit MessageSent(message);
    }

    /**
     * Takes snapshot of state root.
     */
    function saveStateRootSnapshot() external {
        uint256 epoch = block.timestamp / epochPeriod;
        require(stateRootSnapshots[epoch] == bytes32(0), "Snapshot already taken for this epoch.");
        bytes32 stateRoot = getStateroot();
        stateRootSnapshots[epoch] = stateRoot;

        emit SnapshotSaved(epoch, stateRoot);
    }

    function _encode(address _to, bytes memory _calldata)
        internal
        view
        returns (bytes32 fastMessageHash, bytes memory fastMessage)
    {
        // Encode the receiver address with the function signature + arguments i.e calldata
        bytes32 sender = bytes32(bytes20(msg.sender));
        bytes32 to = bytes32(bytes20(_to));
        uint256 nonce = count;
        // add sender and receiver with proper function selector formatting
        // [length][nonce][receiver: 1 slot padded][offset][function selector: 4 bytes no padding][msg.sender: 1 slot padded][function arguments: 1 slot padded]
        assembly {
            fastMessage := mload(0x40) // free memory pointer
            let lengthCalldata := mload(_calldata) // calldata length
            let lengthFastMessageCalldata := add(lengthCalldata, 0x20) // add msg.sender
            let lengthEncodedMessage := add(lengthFastMessageCalldata, 0x80) // 1 offsets, receiver, and lengthFastMessageCalldata
            mstore(fastMessage, lengthEncodedMessage) // bytes length
            mstore(add(fastMessage, 0x20), nonce) // nonce
            mstore(add(fastMessage, 0x4c), to) // receiver
            mstore(add(fastMessage, 0x60), 0x60) // offset
            mstore(add(fastMessage, 0x80), lengthFastMessageCalldata) // fast message length
            mstore(
                add(fastMessage, 0xa0),
                and(mload(add(_calldata, 0x20)), 0xFFFFFFFF00000000000000000000000000000000000000000000000000000000)
            ) // function selector
            mstore(add(fastMessage, 0xb0), sender) // sender

            let _cursor := add(fastMessage, 0xc4) // begin copying arguments of function call
            let _cursorCalldata := add(_calldata, 0x24) // beginning of arguments

            // copy all arguments
            for {
                let j := 0x00
            } lt(j, lengthCalldata) {
                j := add(j, 0x20)
            } {
                mstore(_cursor, mload(add(_cursorCalldata, j)))
                _cursor := add(_cursor, 0x20)
            }
            // update free pointer
            mstore(0x40, _cursor)
        }
        // Compute the hash over the message header (batchSize as nonce) and body (fastMessage).
        bytes32 singleHash = keccak256(fastMessage);
        assembly {
            // efficient hash
            mstore(0x00, singleHash)
            mstore(0x20, singleHash)
            fastMessageHash := keccak256(0x00, 0x40)
        }
    }

    // ********************************* //
    // *         Merkle Tree           * //
    // ********************************* //

    /**
     *  @dev Append data into merkle tree.
     *  `O(log(n))` where `n` is the number of leaves.
     *  Note: Although each insertion is O(log(n)), complexity of n insertions is O(n).
     *  Note: Inlined from `merkle/MerkleTree.sol` for performance.
     *  @param leaf The leaf (already hashed) to insert in the merkle tree.
     */
    function appendMessage(bytes32 leaf) internal returns (uint256 size) {
        unchecked {
            size = count + 1;
            count = size;
            uint256 hashBitField = (size ^ (size - 1)) & size;
            uint256 height;
            while ((hashBitField & 1) == 0) {
                bytes32 node = inbox[height];
                if (node > leaf)
                    assembly {
                        // efficient hash
                        mstore(0x00, leaf)
                        mstore(0x20, node)
                        leaf := keccak256(0x00, 0x40)
                    }
                else
                    assembly {
                        // efficient hash
                        mstore(0x00, node)
                        mstore(0x20, leaf)
                        leaf := keccak256(0x00, 0x40)
                    }
                hashBitField /= 2;
                height++;
            }
            inbox[height] = leaf;
        }
    }

    /**
     * @dev Gets the current state root.
     *  `O(log(n))` where `n` is the number of leaves.
     *  Note: Inlined from `merkle/MerkleTree.sol` for performance.
     */
    function getStateroot() internal view returns (bytes32) {
        unchecked {
            bytes32 node;
            uint256 size = count;
            uint256 height;
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
                size /= 2;
                height++;
            }
            return node;
        }
    }
}
