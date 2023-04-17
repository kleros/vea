import {
  Hearbeat as HearbeatEvent,
  MessageSent as MessageSentEvent,
  SnapshotSaved as SnapshotSavedEvent,
  SnapshotSent as SnapshotSentEvent,
} from "../generated/VeaInbox/VeaInbox";
import {
  Hearbeat,
  MessageSent,
  SnapshotSaved,
  SnapshotSent,
  Sender,
  Receiver,
  Node,
} from "../generated/schema";
import { VeaInbox } from "../generated/VeaInbox/VeaInbox";

import {
  log,
  Bytes,
  TypedMap,
  ByteArray,
  Address,
  BigInt,
  crypto,
  ethereum,
} from "@graphprotocol/graph-ts";

export function handleHearbeat(event: HearbeatEvent): void {
  let entity = new Hearbeat(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.ticketId = event.params.ticketId;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleMessageSent(event: MessageSentEvent): void {
  let entity = new MessageSent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  let msgData = event.params.nodeData;

  let _nonce = new ByteArray(8);
  for (let i = 0; i < 8; i++) _nonce[i] = msgData[i];

  log.error("processing {}", [_nonce.toString()]);

  let _to = new ByteArray(20);
  for (let i = 0; i < 20; i++) _to[i] = msgData[i + 8];

  let dataLength = msgData.length - 28;
  let _data = new ByteArray(dataLength);
  for (let i = 0; i < dataLength; i++) _data[i] = msgData[i + 28];

  let _msgSender = new ByteArray(20);
  for (let i = 0; i < 20; i++) _msgSender[i] = _data[i + 16];

  entity.nonce = BigInt.fromByteArray(_nonce.reverse() as ByteArray);
  entity.to = Bytes.fromByteArray(_to);
  entity.msgSender = Bytes.fromByteArray(_msgSender);
  entity.data = Bytes.fromByteArray(_data);

  let sender = Sender.load(entity.msgSender);
  if (!sender) {
    sender = new Sender(entity.msgSender);
    sender.save();
  }

  let receiver = Receiver.load(entity.to);
  if (!receiver) {
    receiver = new Receiver(entity.to);
    receiver.save();
  }

  let node = new Node(entity.nonce.toString());
  let leafHash = Bytes.fromByteArray(
    crypto.keccak256(Bytes.fromByteArray(crypto.keccak256(msgData)))
  );
  node.hash = leafHash;
  node.save();

  entity.node = entity.nonce.toString();
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  let contract = VeaInbox.bind(event.address);
  entity.epoch = event.block.timestamp.div(contract.epochPeriod());
  entity.save();

  log.error("processing {}", [entity.nonce.toString()]);

  // (newCount ^ (oldCount)) & newCount;
  let newCount = _nonce.toU64() + 1;
  let oldCount = _nonce.toU64();
  let hashBitMap = (newCount ^ oldCount) & newCount;
  let height = 0;
  while (hashBitMap > 1) {
    let sibling: Node | null;
    let index: string;
    if (height == 0) {
      index = BigInt.fromU64(oldCount - 1).toString();
      sibling = Node.load(index);
    } else {
      index = BigInt.fromU64(oldCount + 1 - 2 ** (height + 1)).toString();
      sibling = Node.load(
        index + "," + BigInt.fromU64(oldCount - 2 ** height).toString()
      );
    }

    if (!sibling) {
      log.error("Sibling not found {}", [_nonce.toString()]);
      return;
    }

    leafHash = Bytes.fromByteArray(
      crypto.keccak256(concatAndSortByteArrays(leafHash, sibling.hash))
    );
    let node = new Node(index + "," + BigInt.fromU64(oldCount).toString());
    log.error("saved {}", [index + "," + BigInt.fromU64(oldCount).toString()]);

    node.hash = leafHash;
    node.save();

    hashBitMap /= 2;
    height++;
  }
}

export function handleSnapshotSaved(event: SnapshotSavedEvent): void {
  let entity = new SnapshotSaved(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  let contract = VeaInbox.bind(event.address);
  entity.epoch = event.block.timestamp.div(contract.epochPeriod());
  entity.stateRoot = event.params.stateRoot;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let size = contract.count().toI32();

  let oldCount = size - 1;
  let isFirstHash = true;
  let nodeHash: Bytes;
  let height = 0;
  let index = 0;
  let node: Node | null;
  while (size > 0) {
    if ((size & 1) == 1) {
      // avoid redundant calculation
      if (isFirstHash) {
        isFirstHash = false;
        if (height == 0) {
          index = oldCount;
          node = Node.load(BigInt.fromU64(index).toString());
        } else {
          index = oldCount + 1 - 2 ** height;
          node = Node.load(
            BigInt.fromU64(index).toString() +
              "," +
              BigInt.fromU64(oldCount).toString()
          );
        }

        if (!node) {
          log.error("Node not found1 {}", [
            BigInt.fromU64(index).toString() +
              "," +
              BigInt.fromU64(oldCount).toString(),
          ]);
          return;
        }
        nodeHash = node.hash;
      } else {
        let upperIndex = index - 1;
        index = upperIndex + 1 - 2 ** height;
        const nodeId =
          BigInt.fromU64(index).toString() +
          "," +
          BigInt.fromU64(upperIndex).toString();
        node = Node.load(nodeId);
        if (!node) {
          log.error("Node not found2 {} height {}", [
            nodeId,
            height.toString(),
          ]);
          return;
        }
        let sibling = node.hash;
        nodeHash = Bytes.fromByteArray(
          crypto.keccak256(concatAndSortByteArrays(nodeHash!, sibling))
        );
        node = new Node(
          BigInt.fromU64(index).toString() +
            "," +
            BigInt.fromU64(oldCount).toString()
        );
        node.hash = nodeHash;
        node.save();
      }
    }
    size /= 2;
    height++;
  }
}

function concatAndSortByteArrays(a: ByteArray, b: ByteArray): ByteArray {
  for (let i = 0; i < 32; i++) {
    if (a[i] < b[i]) {
      return a.concat(b);
    } else if (a[i] > b[i]) {
      return b.concat(a);
    }
  }
  return a.concat(a);
}

export function handleSnapshotSent(event: SnapshotSentEvent): void {
  let entity = new SnapshotSent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.epochSent = event.params.epochSent;
  entity.ticketId = event.params.ticketId;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
