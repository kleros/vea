import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Snapshot, Message, Refs } from "../generated/schema";
import {
  MessageSent,
  SnapshotSaved,
  SnapshotSent,
  VeaInboxArbToGnosis,
} from "../generated/VeaInboxArbToGnosis/VeaInboxArbToGnosis";

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

export function handleSnapshotSaved(event: SnapshotSaved): void {
  const currentSnapshot = getCurrentSnapshot();
  currentSnapshot.taken = true;
  currentSnapshot.stateRoot = event.params.stateRoot;
  currentSnapshot.timestamp = event.block.timestamp;
  currentSnapshot.txHash = event.transaction.hash;
  //Get the epochPeriod from the public variable of the deployed contract
  const veaInboxContract = VeaInboxArbToGnosis.bind(event.address);
  const epochPeriod = veaInboxContract.epochPeriod();
  const epoch = event.block.timestamp.div(epochPeriod);
  currentSnapshot.epoch = epoch;
  currentSnapshot.save();

  // Create a new snapshot entity to be the current snapshot.
  const refs = Refs.load("0")!;
  const newSnapshot = new Snapshot(
    refs.currentSnapshotIndex.plus(BigInt.fromI32(1)).toString()
  );
  newSnapshot.numberMessages = BigInt.fromI32(0);
  newSnapshot.taken = false;
  newSnapshot.resolving = false;
  newSnapshot.save();

  // Update the value of currentSnapshotIndex to point to the new snapshot.
  refs.currentSnapshotIndex = refs.currentSnapshotIndex.plus(BigInt.fromI32(1));
  refs.save();
}

export function handleSnapshotSent(event: SnapshotSent): void {
  const epochSent = event.params.epochSent;
  let snapshot: Snapshot | null;
  const refs = Refs.load("0")!;

  for (let i = refs.currentSnapshotIndex.toI32(); i >= 0; i--) {
    const snapshotId = BigInt.fromI32(i).toString();
    snapshot = Snapshot.load(snapshotId);

    if (snapshot && snapshot.epoch === epochSent) {
      // Snapshot found, update resolving field and save
      snapshot.resolving = true;
      snapshot.save();
      break;
    }
  }
}