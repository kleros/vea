import {
  Address,
  BigInt,
  ByteArray,
  Bytes,
  log,
} from "@graphprotocol/graph-ts";
import { Snapshot, Message, Ref, Fallback, Inbox } from "../generated/schema";
import {
  MessageSent,
  SnapshotSaved,
  SnapshotSent,
  VeaInboxArbToEthDevnet,
} from "../generated/VeaInboxArbToEthDevnet/VeaInboxArbToEthDevnet";

export function handleMessageSent(event: MessageSent): void {
  let inbox = Inbox.load(event.address);
  if (!inbox) {
    inbox = new Inbox(event.address);
    inbox.save();
  }
  const snapshot = getCurrentSnapshot(event.address);
  snapshot.numberMessages = snapshot.numberMessages.plus(BigInt.fromI32(1));
  snapshot.save();

  const messageIndex = useNextMessageIndex(event.address);
  const messageId = event.address.toHexString() + "-" + messageIndex.toString();
  const message = new Message(messageId);
  message.snapshot = snapshot.id;
  message.txHash = event.transaction.hash;
  message.timestamp = event.block.timestamp;
  const msgData = event.params._nodeData;
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

function getCurrentSnapshot(inboxAddress: Address): Snapshot {
  let id = inboxAddress.toHexString();
  let ref = Ref.load(id);
  if (!ref) {
    ref = new Ref(id);
    ref.inbox = inboxAddress;
    ref.currentSnapshotIndex = BigInt.fromI32(0);
    ref.nextMessageIndex = BigInt.fromI32(0);
    ref.save();

    // Use a composite ID for the initial snapshot.
    const snapshotId = inboxAddress.toHexString() + "-0";
    const snapshot = new Snapshot(snapshotId);
    snapshot.inbox = inboxAddress;
    snapshot.numberMessages = BigInt.fromI32(0);
    snapshot.taken = false;
    snapshot.resolving = false;
    snapshot.epoch = BigInt.fromI32(0);
    snapshot.epochString = "0";
    snapshot.stateRoot = Bytes.fromHexString(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    snapshot.stateRootString =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    snapshot.timestamp = BigInt.fromI32(0);
    snapshot.save();
    return snapshot;
  }
  let snapshot = Snapshot.load(
    inboxAddress.toHexString() + "-" + ref.currentSnapshotIndex.toString()
  );
  if (!snapshot) {
    // If it doesn't exist, creating one with default values.
    snapshot = new Snapshot(
      inboxAddress.toHexString() + "-" + ref.currentSnapshotIndex.toString()
    );
    snapshot.inbox = inboxAddress;
    snapshot.numberMessages = BigInt.fromI32(0);
    snapshot.taken = false;
    snapshot.resolving = false;
    snapshot.epoch = BigInt.fromI32(0);
    snapshot.epochString = "0";
    snapshot.stateRoot = Bytes.fromHexString(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    snapshot.stateRootString =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    snapshot.timestamp = BigInt.fromI32(0);
    snapshot.save();
  }
  return snapshot;
}

function useNextMessageIndex(inboxAddress: Address): BigInt {
  let id = inboxAddress.toHexString();
  let ref = Ref.load(id);
  if (!ref) {
    ref = new Ref(id);
    ref.inbox = inboxAddress;
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
  let inbox = Inbox.load(event.address);
  if (!inbox) {
    inbox = new Inbox(event.address);
    inbox.save();
  }
  const contract = VeaInboxArbToEthDevnet.bind(event.address);
  const epochPeriod = contract.epochPeriod();
  const epoch = event.block.timestamp.div(epochPeriod);
  const stateRoot = contract.snapshots(epoch);
  const currentSnapshot = getCurrentSnapshot(event.address);
  currentSnapshot.taken = true;
  currentSnapshot.caller = event.transaction.from;
  currentSnapshot.stateRoot = stateRoot;
  currentSnapshot.stateRootString = stateRoot.toHexString();
  currentSnapshot.timestamp = event.block.timestamp;
  currentSnapshot.txHash = event.transaction.hash;
  currentSnapshot.epoch = epoch;
  currentSnapshot.epochString = epoch.toString();
  currentSnapshot.save();

  // Creating a new snapshot entity to be the current snapshot.
  const refId = event.address.toHexString();
  const ref = Ref.load(refId)!;
  const snapshotId =
    ref.inbox.toHexString() +
    "-" +
    ref.currentSnapshotIndex.plus(BigInt.fromI32(1)).toString();
  const newSnapshot = new Snapshot(snapshotId);
  newSnapshot.inbox = event.address;
  newSnapshot.numberMessages = BigInt.fromI32(0);
  newSnapshot.taken = false;
  newSnapshot.resolving = false;
  newSnapshot.save();

  // Update the value of currentSnapshotIndex to point to the new snapshot.
  ref.currentSnapshotIndex = ref.currentSnapshotIndex.plus(BigInt.fromI32(1));
  ref.save();
}

export function handleSnapshotSent(event: SnapshotSent): void {
  const epochSent = event.params._epochSent;

  // Create a unique fallback id based on epochSent and block.timestamp.
  const fallbackId = epochSent.plus(event.block.timestamp).toString();
  const fallback = new Fallback(fallbackId);

  // Load or initialize Ref.
  let id = event.address.toHexString(); // Unique ID per inbox contract
  let ref = Ref.load(id);
  if (!ref) {
    ref = new Ref(id);
    ref.inbox = event.address;
    ref.currentSnapshotIndex = BigInt.fromI32(0);
    ref.nextMessageIndex = BigInt.fromI32(0);
    ref.save();
  }

  fallback.timestamp = event.block.timestamp;
  fallback.txHash = event.transaction.hash;
  fallback.executor = event.transaction.from;
  fallback.ticketId = event.params._ticketId;

  let snapshotFound = false;
  let snapshot: Snapshot | null = null;

  // Iterate from the current snapshot index downward to search for a snapshot with a matching epoch.
  for (let i = ref.currentSnapshotIndex.toI32(); i >= 0; i--) {
    const snapshotId =
      event.address.toHexString() + "-" + BigInt.fromI32(i).toString();
    snapshot = Snapshot.load(snapshotId);
    if (snapshot && snapshot.epoch) {
      if (BigInt.compare(snapshot.epoch as BigInt, epochSent) == 0) {
        // Matching snapshot found: update and mark as resolving.
        snapshot.resolving = true;
        snapshot.save();
        fallback.snapshot = snapshotId;
        snapshotFound = true;
        break;
      }
    }
  }

  // If no snapshot was found, update the current snapshot and create a new one.
  if (!snapshotFound) {
    const inbox = VeaInboxArbToEthDevnet.bind(event.address);

    let currentSnapshot = getCurrentSnapshot(event.address);
    currentSnapshot.taken = false;
    currentSnapshot.resolving = true;
    currentSnapshot.timestamp = epochSent.times(inbox.epochPeriod());
    currentSnapshot.stateRoot = Bytes.fromHexString(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    currentSnapshot.stateRootString =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    currentSnapshot.epoch = epochSent;
    currentSnapshot.epochString = epochSent.toString();
    currentSnapshot.save();

    fallback.snapshot = currentSnapshot.id;

    // Create a new snapshot with an incremented index.
    const newIndex = ref.currentSnapshotIndex.plus(BigInt.fromI32(1));
    const newSnapshotId =
      event.address.toHexString() + "-" + newIndex.toString();
    const newSnapshot = new Snapshot(newSnapshotId);
    newSnapshot.inbox = event.address;
    newSnapshot.numberMessages = BigInt.fromI32(0);
    newSnapshot.taken = false;
    newSnapshot.resolving = false;
    // Initialize new snapshot fields with defaults.
    newSnapshot.epoch = BigInt.fromI32(0);
    newSnapshot.epochString = "0";
    newSnapshot.stateRoot = Bytes.fromHexString(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    newSnapshot.stateRootString =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    newSnapshot.timestamp = BigInt.fromI32(0);
    newSnapshot.save();

    // Update Ref with the new snapshot index.
    ref.currentSnapshotIndex = ref.currentSnapshotIndex.plus(BigInt.fromI32(1));
    ref.save();
  }
  fallback.save();
}
