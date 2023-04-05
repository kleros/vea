import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import { Epoch, Snapshot, SnapshotDetails, Transaction } from '../generated/schema';
import { MessageSent, SnapshotSaved, StaterootSent } from '../generated/VeaInbox/VeaInbox';

export const handleMessageSent = (event: MessageSent): void => {
  let epochId = event.params.msgData[0].toHexString();
  let snapshot = Snapshot.load(epochId);

  if (snapshot == null) {
    snapshot = new Snapshot(epochId);
    snapshot.timestamp = event.block.timestamp;
    snapshot.fromChain = 'unknown';
    snapshot.inboxAddress = event.address.toHex();
    snapshot.toChain = 'unknown';
    snapshot.outboxAddress = 'unknown';
    snapshot.status = 'Invalid';

    let snapshotDetails = new SnapshotDetails(snapshot.id + '-details');
    snapshotDetails.transaction = null;

    snapshot.snapshotDetails = snapshotDetails.id;

    snapshot.save();
    snapshotDetails.save();
  }

  let snapshotDetails = SnapshotDetails.load(snapshot.snapshotDetails);

  if (snapshotDetails == null) {
    snapshotDetails = new SnapshotDetails(snapshot.id + '-details');
    snapshotDetails.transaction = null;
    snapshotDetails.save();
  }
}

export const handleSnapshotSaved = (event: SnapshotSaved): void => {
  let epochId = event.params.epoch.toHex();
  let snapshot = Snapshot.load(epochId);

  if (snapshot == null) {
    snapshot = new Snapshot(epochId);
    snapshot.timestamp = event.block.timestamp;
    snapshot.fromChain = 'unknown';
    snapshot.inboxAddress = event.address.toHex();
    snapshot.toChain = 'unknown';
    snapshot.outboxAddress = 'unknown';
    snapshot.status = 'Invalid';

    let snapshotDetails = new SnapshotDetails(snapshot.id + '-details');
    snapshotDetails.transaction = null;

    snapshot.snapshotDetails = snapshotDetails.id;

    snapshot.save();
    snapshotDetails.save();
  }

  let snapshotDetails = SnapshotDetails.load(snapshot.snapshotDetails);

  if (snapshotDetails == null) {
    snapshotDetails = new SnapshotDetails(snapshot.id + '-details');
    snapshotDetails.transaction = null;
    snapshotDetails.save();
  }

  let transaction = new Transaction(event.transaction.hash.toHex() + '-' + event.logIndex.toString());

  transaction.chain = 'arbitrum goerli';
  transaction.transactionId = event.params.stateRoot.toHex();
  transaction.timestamp = event.block.timestamp;
  transaction.caller = event.transaction.from.toHex();
  transaction.stateRoot = event.params.stateRoot;

  transaction.save();

  snapshotDetails.transaction = transaction.id;
  snapshotDetails.save();

  snapshot.status = 'Taken'; // update status to "Taken"
  snapshot.save();
}

export const handleStaterootSent = (event: StaterootSent): void => {
  let epochId = event.params.epoch.toHex();
  let snapshot = Snapshot.load(epochId);

  if (snapshot == null) {
    snapshot = new Snapshot(epochId);
    snapshot.timestamp = event.block.timestamp;
    snapshot.fromChain = 'unknown';
    snapshot.inboxAddress = event.address.toHex();
    snapshot.toChain = 'unknown';
    snapshot.outboxAddress = 'unknown';
    snapshot.status = 'unknown';

    let snapshotDetails = new SnapshotDetails(snapshot.id + '-details');
    snapshotDetails.transaction = null;

    snapshot.snapshotDetails = snapshotDetails.id;

    snapshot.save();
    snapshotDetails.save();
  }

  let snapshotDetails = SnapshotDetails.load(snapshot.snapshotDetails);

  if (snapshotDetails == null) {
    snapshotDetails = new SnapshotDetails(snapshot.id + '-details');
    snapshotDetails.transaction = null;
    snapshotDetails.save();
  }

  let transaction = new Transaction(event.transaction.hash.toHex() + '-' + event.logIndex.toString());

  transaction.chain = 'ethereum';
  transaction.transactionId = event.params.stateRoot.toHex();
  transaction.timestamp = event.block.timestamp;
  transaction.caller = event.transaction.from.toHex();
  transaction.stateRoot = event.params.stateRoot;

  transaction.save();

  snapshot.status = 'Taken';

  let toChainId = event.params.destinationChainId.toHex();
  let toChain = Chain.load(toChainId);

  if (toChain == null) {
    toChain = new Chain(toChainId);
    toChain.name = 'unknown';
    toChain.save();
  }

  snapshot.toChain = toChain.id;
  snapshot.outboxAddress = event.params.outbox.toHex();

  snapshot.save();
}