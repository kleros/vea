import { BigInt, ByteArray, Bytes } from "@graphprotocol/graph-ts";
import { Snapshot, Message, Ref, Fallback } from "../generated/schema";
import {
  MessageSent,
  SnapshotSaved,
  SnapshotSent,
  VeaInbox,
} from "../generated/VeaInboxArbToGnosis/VeaInbox";

export function handleMessageSent(event: MessageSent): void {
  const snapshot = getCurrentSnapshot();
  snapshot.numberMessages = snapshot.numberMessages.plus(BigInt.fromI32(1));
  snapshot.save();

  const messageIndex = useNextMessageIndex();
  const message = new Message(messageIndex.toString());
  message.snapshot = snapshot.id;
  message.txHash = event.transaction.hash;
  message.timestamp = event.block.timestamp;
  const msgData = event.params.nodeData;
  const _to = new ByteArray(20);
  for (let i = 0; i < 20; i++) _to[i] = msgData[i + 8];

  const dataLength = msgData.length - 28;
  const _data = new ByteArray(dataLength);
  for (let i = 0; i < dataLength; i++) _data[i] = msgData[i + 28];

  const _msgSender = new ByteArray(20);
  for (let i = 0; i < 20; i++) _msgSender[i] = _data[i + 16];

  message.from = Bytes.fromByteArray(_msgSender);
  message.to = Bytes.fromByteArray(_to);
  message.data = Bytes.fromByteArray(_data);
  message.save();
}

function getCurrentSnapshot(): Snapshot {
  let ref = Ref.load("0");
  if (!ref) {
    ref = new Ref("0");
    ref.currentSnapshotIndex = BigInt.fromI32(0);
    ref.nextMessageIndex = BigInt.fromI32(0);
    ref.save();
    const snapshot = new Snapshot("0");
    snapshot.numberMessages = BigInt.fromI32(0);
    snapshot.taken = false;
    snapshot.resolving = false;
    snapshot.save();
    return snapshot;
  }
  return Snapshot.load(ref.currentSnapshotIndex.toString())!;
}

function useNextMessageIndex(): BigInt {
  let ref = Ref.load("0");
  if (!ref) {
    ref = new Ref("0");
    ref.currentSnapshotIndex = BigInt.fromI32(0);
    ref.nextMessageIndex = BigInt.fromI32(1);
    ref.save();
    return BigInt.fromI32(0);
  }
  const messageIndex = ref.nextMessageIndex;
  ref.nextMessageIndex = ref.nextMessageIndex.plus(BigInt.fromI32(1));
  ref.save();
  return messageIndex;
}

export function handleSnapshotSaved(event: SnapshotSaved): void {
  const inbox = VeaInbox.bind(event.address);
  // Get the epochPeriod from the public variable of the deployed contract
  const epochPeriod = inbox.epochPeriod();
  const epoch = event.block.timestamp.div(epochPeriod);
  // Get stateRoot from contract
  const stateRoot = inbox.snapshots(epoch);
  const currentSnapshot = getCurrentSnapshot();
  currentSnapshot.taken = true;
  currentSnapshot.caller = event.transaction.from;
  currentSnapshot.stateRoot = stateRoot;
  currentSnapshot.timestamp = event.block.timestamp;
  currentSnapshot.txHash = event.transaction.hash;
  currentSnapshot.epoch = epoch;
  currentSnapshot.save();

  // Create a new snapshot entity to be the current snapshot.
  const ref = Ref.load("0")!;
  const newSnapshot = new Snapshot(
    ref.currentSnapshotIndex.plus(BigInt.fromI32(1)).toString()
  );
  newSnapshot.numberMessages = BigInt.fromI32(0);
  newSnapshot.taken = false;
  newSnapshot.resolving = false;
  newSnapshot.save();

  // Update the value of currentSnapshotIndex to point to the new snapshot.
  ref.currentSnapshotIndex = ref.currentSnapshotIndex.plus(BigInt.fromI32(1));
  ref.save();
}

export function handleSnapshotSent(event: SnapshotSent): void {
  const epochSent = event.params.epochSent;
  const fallback = new Fallback(
    epochSent.plus(event.block.timestamp).toString()
  );
  let snapshot: Snapshot | null;
  const ref = Ref.load("0")!;
  fallback.timestamp = event.block.timestamp;
  fallback.txHash = event.transaction.hash;
  fallback.executor = event.transaction.from;
  fallback.ticketId = event.params.ticketId;

  for (let i = ref.currentSnapshotIndex.toI32(); i >= 0; i--) {
    const snapshotId = BigInt.fromI32(i).toString();
    snapshot = Snapshot.load(snapshotId);

    if (snapshot && snapshot.epoch === epochSent) {
      // Snapshot found, update resolving field and save
      snapshot.resolving = true;
      snapshot.save();
      fallback.snapshot = snapshotId;
      break;
    }
  }
  fallback.save();
}
