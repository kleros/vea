import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Snapshot, Message, Refs } from "../generated/schema";
import {
  MessageSent,
  SnapshotSaved,
  StaterootSent,
} from "../generated/VeaInbox/VeaInbox";

export function handleMessageSent(event: MessageSent): void {
  const snapshot = getCurrentSnapshot();
  snapshot.numberMessages = snapshot.numberMessages.plus(BigInt.fromI32(1));
  snapshot.save();

  const messageIndex = useNextMessageIndex();
  const message = new Message(messageIndex.toString());
  message.snapshot = snapshot.id;
  const msgData = event.params.msgData.toHexString();
  message.txHash = event.transaction.hash;
  message.from = Bytes.fromHexString(msgData.substring(18, 58));
  message.to = Bytes.fromHexString(msgData.substring(58, 98));
  message.data = Bytes.fromHexString(msgData.substring(98));
  message.timestamp = event.block.timestamp;
  message.save();
}

function getCurrentSnapshot(): Snapshot {
  let refs = Refs.load("0");
  if (!refs) {
    refs = new Refs("0");
    refs.currentSnapshotIndex = BigInt.fromI32(0);
    refs.nextMessageIndex = BigInt.fromI32(0);
    refs.save();
    const snapshot = new Snapshot("0");
    snapshot.numberMessages = BigInt.fromI32(0);
    snapshot.taken = false;
    snapshot.resolving = false;
    snapshot.save();
    return snapshot;
  }
  return Snapshot.load(refs.currentSnapshotIndex.toString())!;
}

function useNextMessageIndex(): BigInt {
  let refs = Refs.load("0");
  if (!refs) {
    refs = new Refs("0");
    refs.currentSnapshotIndex = BigInt.fromI32(0);
    refs.nextMessageIndex = BigInt.fromI32(1);
    refs.save();
    return BigInt.fromI32(0);
  }
  const messageIndex = refs.nextMessageIndex;
  refs.nextMessageIndex = refs.nextMessageIndex.plus(BigInt.fromI32(1));
  refs.save();
  return messageIndex;
}

export function handleSnapshotSaved(event: SnapshotSaved): void {}

export function handleStaterootSent(event: StaterootSent): void {}
