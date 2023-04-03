import {
  MessageSent as MessageSentEvent,
  SnapshotSaved as SnapshotSavedEvent,
  StaterootSent as StaterootSentEvent,
} from "../generated/VeaInbox/VeaInbox";
import { MessageSent, Node, Sender, Receiver, SnapshotSaved, StaterootSent } from "../generated/schema";
import { log, Bytes, TypedMap, ByteArray, Address, BigInt, crypto, ethereum } from "@graphprotocol/graph-ts";
import { VeaInbox } from "../generated/VeaInbox/VeaInbox";

export function handleMessageSent(event: MessageSentEvent): void {
  let entity = new MessageSent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  let msgData = event.params.msgData;

  let _nonce = new ByteArray(8);
  for (let i = 0; i < 8; i++) _nonce[i] = msgData[i];

  let _msgSender = new ByteArray(20);
  for (let i = 0; i < 20; i++) _msgSender[i] = msgData[i + 8];

  let _to = new ByteArray(20);
  for (let i = 0; i < 20; i++) _to[i] = msgData[i + 28];

  let dataLength = msgData.length - 48;
  let _data = new ByteArray(dataLength);
  for (let i = 0; i < dataLength; i++) _data[i] = msgData[i + 48];

  entity.nonce = BigInt.fromByteArray(_nonce);
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

  let bytesNonce = Bytes.fromByteArray(_nonce);
  let node = new Node(Bytes.fromByteArray(crypto.keccak256(Bytes.fromByteArray(crypto.keccak256(msgData)))));
  node.save();

  entity.leaf = bytesNonce;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  let contract = VeaInbox.bind(event.address);
  entity.epoch = event.block.timestamp.div(contract.epochPeriod());
  entity.save();
}

export function handleSnapshotSaved(event: SnapshotSavedEvent): void {
  let entity = new SnapshotSaved(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.epoch = event.params.epoch;
  entity.stateRoot = event.params.stateRoot;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleStaterootSent(event: StaterootSentEvent): void {
  let entity = new StaterootSent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.epoch = event.params.epoch;
  entity.stateRoot = event.params.stateRoot;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

function concatAndSortByteArrays(a: ByteArray, b: ByteArray): ByteArray {
  let out: ByteArray;
  for (let i = 0; i < 32; i++) {
    if (a[i] > b[i]) {
      out = b.concat(a);
      return out;
    } else if (b[i] < a[i]) {
      out = a.concat(b);
      return out;
    }
  }
  return a;
}
