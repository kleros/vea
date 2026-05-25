import { indexer } from "envio";
import { decodeNodeData } from "./utils/decoder";
import { leafHash, hashPair } from "./utils/merkle";

/**
 * @dev Handles the MessageSent event emitted by VeaInboxArbToEth.
 *      Decodes the node data to extract message fields, stores a leaf-level
 *      MerkleNode, upserts the Inbox/Sender/Receiver lookup entities, and
 *      persists the MessageSent record.  After persisting, it walks up the
 *      Merkle tree and computes every internal node whose value changed as a
 *      result of this new leaf, identified by the XOR-difference bitmap
 *      between the old and new message counts.
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
    inbox,
    nonce,
    to,
    msgSender,
    data,
    node: nodeId,
    blockNumber: BigInt(event.block.number),
    blockTimestamp: BigInt(event.block.timestamp),
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
 */
indexer.onEvent({ contract: "VeaInboxArbToEth", event: "SnapshotSaved" }, async ({ event, context }) => {
  const inbox = event.srcAddress;
  const epoch = event.params._epoch;
  const count = event.params._count;

  const existingInbox = await context.Inbox.get(inbox);
  if (!existingInbox) context.Inbox.set({ id: inbox });

  context.SnapshotSaved.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    stateRoot: event.params._snapshot,
    epoch,
    count,
    blockNumber: BigInt(event.block.number),
    blockTimestamp: BigInt(event.block.timestamp),
  });

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
 *      Upserts the Inbox entity and persists the SnapshotSent record,
 *      capturing the epoch and the cross-chain ticket ID assigned by the
 *      bridge when the snapshot was dispatched to the outbox chain.
 */
indexer.onEvent({ contract: "VeaInboxArbToEth", event: "SnapshotSent" }, async ({ event, context }) => {
  const inbox = event.srcAddress;

  const existingInbox = await context.Inbox.get(inbox);
  if (!existingInbox) context.Inbox.set({ id: inbox });

  context.SnapshotSent.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    epochSent: event.params._epochSent,
    ticketId: event.params._ticketId,
    blockNumber: BigInt(event.block.number),
    blockTimestamp: BigInt(event.block.timestamp),
  });
});
