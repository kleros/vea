import { createTestIndexer } from "envio";

const INBOX = "0x8B925669606026CcCfAFD72840F5b0CAeDA80078";
const INBOX_2 = "0x45138BC4E364A16919C4571699171d774A7590BD";
const TO = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SENDER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CALLER = ("0x" + "ca11".repeat(10)) as `0x${string}`;
const SAVED_TX_HASH = "0x" + "7a5e".repeat(16);
const STATE_ROOT = "0x" + "11".repeat(32);
const EXECUTOR = ("0x" + "ec20".repeat(10)) as `0x${string}`;
const EXECUTOR_2 = ("0x" + "ec21".repeat(10)) as `0x${string}`;
const FALLBACK_TX_HASH = "0x" + "fa11".repeat(16);
const FALLBACK_TX_HASH_2 = "0x" + "fa12".repeat(16);
const TICKET_ID = "0x" + "71c4".repeat(16);
const TICKET_ID_2 = "0x" + "71c5".repeat(16);

function mockNodeData(nonce: bigint, data = "deadbeef"): string {
  const nonceHex = nonce.toString(16).padStart(16, "0");
  return `0x${nonceHex}${TO.slice(2)}${SENDER.slice(2)}${data}`;
}

describe("handleMessageSent", () => {
  it("creates a Message on the inbox's current snapshot and increments numberMessages", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        421614: {
          simulate: [
            {
              contract: "VeaInboxArbToEth",
              event: "MessageSent",
              srcAddress: INBOX,
              params: { _nodeData: mockNodeData(0n) },
            },
            {
              contract: "VeaInboxArbToEth",
              event: "MessageSent",
              srcAddress: INBOX,
              params: { _nodeData: mockNodeData(1n) },
            },
          ],
        },
      },
    });

    const snapshot = await indexer.Snapshot.getOrThrow(`${INBOX}-0`);
    expect(snapshot.numberMessages).toBe(2n);
    expect(snapshot.saved).toBe(false);

    const message = await indexer.Message.getOrThrow(`${INBOX}-1`);
    expect(message.snapshot_id).toBe(`${INBOX}-0`);
    expect(message.to).toBe(TO);
    expect(message.from).toBe(SENDER);
    expect(message.data).toBe("0xdeadbeef");

    const node = await indexer.MerkleNode.getOrThrow(`${INBOX}-1`);
    expect(node.hash).toMatch(/^0x[0-9a-f]{64}$/);

    const messageSentEvents = await indexer.MessageSent.getAll();
    const ms0 = messageSentEvents.find((m) => m.nonce === 0n);
    expect(ms0).toBeDefined();
    expect(ms0!.node_id).toBe(`${INBOX}-0`);
    expect(ms0!.inbox_id).toBe(INBOX);
    expect(ms0!.to_id).toBe(TO);
    expect(ms0!.msgSender_id).toBe(SENDER);
  });

  it("keeps each inbox's Snapshot/Ref state independent", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        421614: {
          simulate: [
            {
              contract: "VeaInboxArbToEth",
              event: "MessageSent",
              srcAddress: INBOX,
              params: { _nodeData: mockNodeData(0n) },
            },
            {
              contract: "VeaInboxArbToEth",
              event: "MessageSent",
              srcAddress: INBOX,
              params: { _nodeData: mockNodeData(1n) },
            },
            {
              contract: "VeaInboxArbToEth",
              event: "MessageSent",
              srcAddress: INBOX_2,
              params: { _nodeData: mockNodeData(0n) },
            },
          ],
        },
      },
    });

    const snapshot1 = await indexer.Snapshot.getOrThrow(`${INBOX}-0`);
    const snapshot2 = await indexer.Snapshot.getOrThrow(`${INBOX_2}-0`);

    expect(snapshot1.numberMessages).toBe(2n);
    expect(snapshot2.numberMessages).toBe(1n);

    const message1 = await indexer.Message.getOrThrow(`${INBOX}-1`);
    expect(message1.inbox_id).toBe(INBOX);
    expect(message1.snapshot_id).toBe(`${INBOX}-0`);

    const message2 = await indexer.Message.getOrThrow(`${INBOX_2}-0`);
    expect(message2.inbox_id).toBe(INBOX_2);
    expect(message2.snapshot_id).toBe(`${INBOX_2}-0`);
    expect(await indexer.Message.get(`${INBOX_2}-1`)).toBeUndefined();

    const ref1 = await indexer.Ref.getOrThrow(INBOX);
    const ref2 = await indexer.Ref.getOrThrow(INBOX_2);
    expect(ref1.currentSnapshotIndex).toBe(0n);
    expect(ref2.currentSnapshotIndex).toBe(0n);
  });
});

describe("handleSnapshotSaved", () => {
  it("finalizes the current snapshot and opens the next one", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        421614: {
          simulate: [
            {
              contract: "VeaInboxArbToEth",
              event: "MessageSent",
              srcAddress: INBOX,
              params: { _nodeData: mockNodeData(0n) },
            },
            {
              contract: "VeaInboxArbToEth",
              event: "SnapshotSaved",
              srcAddress: INBOX,
              transaction: { hash: SAVED_TX_HASH, from: CALLER },
              params: {
                _snapshot: STATE_ROOT,
                _epoch: 5n,
                _count: 1n,
              },
            },
            {
              contract: "VeaInboxArbToEth",
              event: "MessageSent",
              srcAddress: INBOX,
              params: { _nodeData: mockNodeData(1n) },
            },
          ],
        },
      },
    });

    const savedSnapshot = await indexer.Snapshot.getOrThrow(`${INBOX}-0`);
    expect(savedSnapshot.saved).toBe(true);
    expect(savedSnapshot.epoch).toBe(5n);
    expect(savedSnapshot.caller).toBe(CALLER);
    expect(savedSnapshot.txHash).toBe(SAVED_TX_HASH);
    expect(savedSnapshot.numberMessages).toBe(1n);

    const nextSnapshot = await indexer.Snapshot.getOrThrow(`${INBOX}-1`);
    expect(nextSnapshot.saved).toBe(false);
    expect(nextSnapshot.numberMessages).toBe(1n);

    const message = await indexer.Message.getOrThrow(`${INBOX}-1`);
    expect(message.snapshot_id).toBe(`${INBOX}-1`);

    const snapshotSaved = await indexer.SnapshotSaved.getAll();
    expect(snapshotSaved[0].caller).toBe(CALLER);
    expect(snapshotSaved[0].txHash).toBe(SAVED_TX_HASH);
  });
});

describe("handleSnapshotSent", () => {
  it("marks a matching-epoch snapshot as resolving and records a Fallback", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        421614: {
          simulate: [
            {
              contract: "VeaInboxArbToEth",
              event: "MessageSent",
              srcAddress: INBOX,
              params: { _nodeData: mockNodeData(0n) },
            },
            {
              contract: "VeaInboxArbToEth",
              event: "SnapshotSaved",
              srcAddress: INBOX,
              params: {
                _snapshot: STATE_ROOT,
                _epoch: 5n,
                _count: 1n,
              },
            },
            {
              contract: "VeaInboxArbToEth",
              event: "SnapshotSent",
              srcAddress: INBOX,
              transaction: { hash: FALLBACK_TX_HASH, from: EXECUTOR },
              params: { _epochSent: 5n, _ticketId: TICKET_ID },
            },
          ],
        },
      },
    });

    const snapshot = await indexer.Snapshot.getOrThrow(`${INBOX}-0`);
    expect(snapshot.resolving).toBe(true);

    const fallbacks = await indexer.Fallback.getAll();
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0].snapshot_id).toBe(`${INBOX}-0`);
    expect(fallbacks[0].executor).toBe(EXECUTOR);
    expect(fallbacks[0].txHash).toBe(FALLBACK_TX_HASH);
  });

  it("finalizes the current snapshot as the fallback target when no epoch matches", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        421614: {
          simulate: [
            {
              contract: "VeaInboxArbToEth",
              event: "SnapshotSent",
              srcAddress: INBOX,
              transaction: { hash: FALLBACK_TX_HASH_2, from: EXECUTOR_2 },
              params: { _epochSent: 9n, _ticketId: TICKET_ID_2 },
            },
          ],
        },
      },
    });

    const snapshot = await indexer.Snapshot.getOrThrow(`${INBOX}-0`);
    expect(snapshot.resolving).toBe(true);
    expect(snapshot.saved).toBe(false);
    expect(snapshot.epoch).toBe(9n);

    const nextSnapshot = await indexer.Snapshot.getOrThrow(`${INBOX}-1`);
    expect(nextSnapshot.resolving).toBe(false);

    const fallbacks = await indexer.Fallback.getAll();
    expect(fallbacks[0].snapshot_id).toBe(`${INBOX}-0`);
  });
});
