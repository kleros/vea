import { indexer } from "envio";
import { decodeNodeData } from "./utils/decoder";
import { leafHash, hashPair } from "./utils/merkle";
import { getOrCreateRef, getCurrentSnapshot, openNewSnapshot } from "./utils/snapshot";

/**
 * @dev Handles the MessageSent event emitted by VeaInboxArbToEth.
 *      Decsodes the node data to extract mesage fields, stores a leaf-level
 *      MerkleNode, upserts the Inbox/Sender/Receiver lookup entities, and
 *      persists the MessageSent record.  After persisting, it walks up the
 *      Merkle tree and computes every internal node whose value changed as a
 *      result of this new leaf, identified by the XOR-difference bitmap
 *      between the old and new message counts.  It also updates the
 *      validator/explorer-facing Snapshot/Message bookkeeping.
 */
indexer.onEvent({ contract: "VeaInboxArbToEth", event: "MessageSent" }, async ({ event, context }) => {
  const { nonce, to, msgSender, data } = decodeNodeData(event.params._nodeData);
  const inbox = event.srcAddress;
  const leaf = leafHash(event.params._nodeData);
  const nodeId = `${inbox}-${nonce}`;

  context.MerkleNode.set({ id: nodeId, hash: leaf });

  const existingInbox = await context.Inbox.get(inbox);
  if (!existingInbox) context.Inbox.set({ id: inbox });

  const existingSender = await context.Sender.get(msgSender);
  if (!existingSender) context.Sender.set({ id: msgSender });

  const existingReceiver = await context.Receiver.get(to);
  if (!existingReceiver) context.Receiver.set({ id: to });

  context.MessageSent.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    inbox_id: inbox,
    nonce,
    to_id: to,
    msgSender_id: msgSender,
    data,
    node_id: nodeId,
    blockNumber: BigInt(event.block.number),
    blockTimestamp: BigInt(event.block.timestamp),
  });

  // --- validator/explore ---
  const snapshot = await getCurrentSnapshot(inbox, context);
  context.Snapshot.set({ ...snapshot, numberMessages: snapshot.numberMessages + 1n });

  context.Message.set({
    id: `${inbox}-${nonce}`,
    inbox_id: inbox,
    txHash: event.transaction.hash,
    timestamp: BigInt(event.block.timestamp),
    from: msgSender,
    to,
    snapshot_id: snapshot.id,
    data,
  });

  // @dev hashBitMap isolates the bits that flipped between oldCount and newCount;
  //      each set bit corresponds to a tree level whose internal node must be recomputed.
  const oldCount = nonce;
  const newCount = nonce + 1n;
  let hashBitMap = (newCount ^ oldCount) & newCount;
  let height = 0;
  let currentHash = leaf;

  // @dev At height 0 the sibling is the preceding leaf; at higher heights the
  //      sibling is the root of the subtree that ends just before oldCount at that level.
  while (hashBitMap > 1n) {
    let siblingId: string;
    let index: bigint;

    if (height === 0) {
      index = oldCount - 1n;
      siblingId = `${inbox}-${index}`;
    } else {
      index = oldCount + 1n - 2n ** BigInt(height + 1);
      siblingId = `${inbox}-${index},${oldCount - 2n ** BigInt(height)}`;
    }

    const sibling = await context.MerkleNode.get(siblingId);
    if (!sibling) return;

    currentHash = hashPair(currentHash, sibling.hash);
    context.MerkleNode.set({ id: `${inbox}-${index},${oldCount}`, hash: currentHash });

    hashBitMap /= 2n;
    height++;
  }
});

/**
 * @dev Handles the SnapshotSaved event emitted by VeaInboxArbToEth.
 *      Upserts the Inbox entity and persists the SnapshotSaved record.
 *      Then reconstructs any intermediate Merkle nodes that were not
 *      materialised during message ingestion by iterating over the set bits
 *      of `count` (each set bit marks a complete subtree at that height)
 *      and combining them right-to-left to produce the missing upper nodes.
 *
 *      It also finalizes the current in-progress Snapshot with the real state root, epoch,
 *      caller, and txHash from the event, then opens a new in-progress
 *      Snapshot for subsequent messages to accumulate into.
 */
indexer.onEvent({ contract: "VeaInboxArbToEth", event: "SnapshotSaved" }, async ({ event, context }) => {
  const inbox = event.srcAddress;
  const epoch = event.params._epoch;
  const count = event.params._count;
  const stateRoot = event.params._snapshot;
  const caller = event.transaction.from;
  const txHash = event.transaction.hash;

  const existingInbox = await context.Inbox.get(inbox);
  if (!existingInbox) context.Inbox.set({ id: inbox });

  context.SnapshotSaved.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    inbox_id: inbox,
    caller,
    txHash,
    stateRoot,
    epoch,
    count,
    blockNumber: BigInt(event.block.number),
    blockTimestamp: BigInt(event.block.timestamp),
  });

  // --- validator/explorer ---
  const currentSnapshot = await getCurrentSnapshot(inbox, context);
  context.Snapshot.set({
    ...currentSnapshot,
    saved: true,
    stateRoot,
    caller,
    txHash,
    epoch,
    timestamp: BigInt(event.block.timestamp),
  });
  await openNewSnapshot(inbox, context);

  // @dev size is shifted right each iteration; each set bit represents a perfect
  //      subtree of height `height` whose rightmost leaf index is `oldCount`.
  let size = count;
  const oldCount = size - 1n;
  let isFirstHash = true;
  let nodeHash = "";
  let height = 0n;
  let index = 0n;

  while (size > 0n) {
    if ((size & 1n) === 1n) {
      if (isFirstHash) {
        // @dev Seed nodeHash with the rightmost complete subtree root before
        //      folding in further subtrees to the left.
        isFirstHash = false;
        if (height === 0n) {
          index = oldCount;
          const node = await context.MerkleNode.get(`${inbox}-${index}`);
          if (!node) return;
          nodeHash = node.hash;
        } else {
          index = oldCount + 1n - 2n ** height;
          const node = await context.MerkleNode.get(`${inbox}-${index},${oldCount}`);
          if (!node) return;
          nodeHash = node.hash;
        }
      } else {
        // @dev Combine the next subtree (to the left) with the accumulated hash
        //      and store the resulting internal node if it does not yet exist.
        const upperIndex = index - 1n;
        index = upperIndex + 1n - 2n ** height;
        const node = await context.MerkleNode.get(`${inbox}-${index},${upperIndex}`);
        if (!node) return;
        nodeHash = hashPair(nodeHash, node.hash);

        const newNodeId = `${inbox}-${index},${oldCount}`;
        const existing = await context.MerkleNode.get(newNodeId);
        if (!existing) context.MerkleNode.set({ id: newNodeId, hash: nodeHash });
      }
    }
    size >>= 1n;
    height++;
  }
});

/**
 * @dev Handles the SnapshotSent event emitted by VeaInboxArbToEth.
 *      Upserts the Inbox entity, then ports veascan's fallback-matching
 *      logic: search backward through snapshots for one whose epoch matches
 *      the sent epoch; if found, mark it as resolving. If none is found,
 *      finalize the current in-progress snapshot as the fallback target and
 *      open a new one. Either way, a Fallback record is created pointing at
 *      the matched/finalized snapshot, capturing the epoch and the
 *      cross-chain ticket ID assigned by the bridge when the snapshot was
 *      dispatched to the outbox chain.
 */
indexer.onEvent({ contract: "VeaInboxArbToEth", event: "SnapshotSent" }, async ({ event, context }) => {
  const inbox = event.srcAddress;
  const epochSent = event.params._epochSent;
  const ticketId = event.params._ticketId;

  const existingInbox = await context.Inbox.get(inbox);
  if (!existingInbox) context.Inbox.set({ id: inbox });
  const executor = event.transaction.from!;
  const txHash = event.transaction.hash;
  const timestamp = BigInt(event.block.timestamp);

  const ref = await getOrCreateRef(inbox, context);
  let matchedSnapshotId: string | undefined;

  for (let i = ref.currentSnapshotIndex; i >= 0n; i--) {
    const snapshotId = `${inbox}-${i}`;
    const candidate = await context.Snapshot.get(snapshotId);
    if (candidate && candidate.epoch === epochSent) {
      context.Snapshot.set({ ...candidate, resolving: true });
      matchedSnapshotId = snapshotId;
      break;
    }
  }

  if (!matchedSnapshotId) {
    const currentSnapshot = await getCurrentSnapshot(inbox, context);
    context.Snapshot.set({
      ...currentSnapshot,
      saved: false,
      resolving: true,
      epoch: epochSent,
      timestamp,
    });
    matchedSnapshotId = currentSnapshot.id;
    await openNewSnapshot(inbox, context);
  }

  context.Fallback.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    snapshot_id: matchedSnapshotId,
    executor,
    timestamp,
    txHash,
    ticketId,
  });
});
