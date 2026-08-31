import { EvmOnEventContext } from "envio";

export async function getOrCreateRef(inbox: string, context: EvmOnEventContext) {
  const existing = await context.Ref.get(inbox);
  if (existing) return existing;
  const ref = { id: inbox, inbox_id: inbox, currentSnapshotIndex: 0n };
  context.Ref.set(ref);
  return ref;
}

function freshSnapshot(id: string, inbox: string) {
  return {
    id,
    inbox_id: inbox,
    // @dev epoch/caller/txHash/timestamp/stateRoot are all nullable in the schema.
    epoch: undefined,
    caller: undefined,
    txHash: undefined,
    timestamp: undefined,
    stateRoot: undefined,
    numberMessages: 0n,
    saved: false,
    resolving: false,
  };
}

export async function getCurrentSnapshot(inbox: string, context: EvmOnEventContext) {
  const ref = await getOrCreateRef(inbox, context);
  const snapshotId = `${inbox}-${ref.currentSnapshotIndex}`;
  const existing = await context.Snapshot.get(snapshotId);
  if (existing) return existing;
  const snapshot = freshSnapshot(snapshotId, inbox);
  context.Snapshot.set(snapshot);
  return snapshot;
}

export async function openNewSnapshot(inbox: string, context: EvmOnEventContext) {
  const ref = await getOrCreateRef(inbox, context);
  const nextIndex = ref.currentSnapshotIndex + 1n;
  context.Ref.set({ ...ref, currentSnapshotIndex: nextIndex });
  const snapshot = freshSnapshot(`${inbox}-${nextIndex}`, inbox);
  context.Snapshot.set(snapshot);
  return snapshot;
}
