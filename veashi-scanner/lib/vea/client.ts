import type { VeaClaim, VeaEpochRow, VeaMessageRow, VeaRoute, VeaSnapshot } from "./types";
import { deriveStatus } from "./status";

const INBOX_URL = import.meta.env.VITE_VEA_INBOX_ENVIO_URL ?? "http://localhost:8080/v1/graphql";
const OUTBOX_URL = import.meta.env.VITE_VEA_OUTBOX_ENVIO_URL ?? "http://localhost:8081/v1/graphql";

const FETCH_TIMEOUT_MS = 5_000;

async function gql<T>(url: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors) {
      console.error("Vea GraphQL errors:", json.errors);
      return null;
    }
    return json.data as T;
  } catch (err) {
    console.error("Vea GraphQL request failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const SNAPSHOT_FIELDS = `
  id epoch caller txHash timestamp stateRoot numberMessages saved resolving
  fallback { executor timestamp txHash ticketId }
`;

const CLAIM_FIELDS = `
  id epoch stateRoot bridger timestamp txHash challenged verified
  challenge { txHash timestamp challenger }
  verification { startTimestamp startCaller startTxHash verifiedTimestamp verifiedCaller verifiedTxHash }
`;

interface RawFallback {
  executor: string;
  timestamp: string | null;
  txHash: string;
  ticketId: string;
}

interface RawSnapshot {
  id: string;
  epoch: string | null;
  caller: string | null;
  txHash: string | null;
  timestamp: string | null;
  stateRoot: string | null;
  numberMessages: string;
  saved: boolean;
  resolving: boolean;
  fallback: RawFallback[];
}

interface RawChallenge {
  txHash: string;
  timestamp: string;
  challenger: string;
}

interface RawVerification {
  startTimestamp: string | null;
  startCaller: string | null;
  startTxHash: string | null;
  verifiedTimestamp: string | null;
  verifiedCaller: string | null;
  verifiedTxHash: string | null;
}

interface RawClaim {
  id: string;
  epoch: string;
  stateRoot: string;
  bridger: string;
  timestamp: string;
  txHash: string;
  challenged: boolean;
  verified: boolean;
  challenge: RawChallenge[];
  verification: RawVerification[];
}

function toSnapshot(s: RawSnapshot): VeaSnapshot {
  return {
    id: s.id,
    epoch: s.epoch !== null ? Number(s.epoch) : undefined,
    caller: s.caller ?? undefined,
    txHash: s.txHash ?? undefined,
    timestamp: s.timestamp !== null ? Number(s.timestamp) : undefined,
    stateRoot: s.stateRoot ?? undefined,
    numberMessages: Number(s.numberMessages),
    saved: s.saved,
    resolving: s.resolving,
    fallback: s.fallback.map((f) => ({
      executor: f.executor,
      timestamp: f.timestamp !== null ? Number(f.timestamp) : undefined,
      txHash: f.txHash,
      ticketId: f.ticketId,
    })),
  };
}

function toClaim(c: RawClaim): VeaClaim {
  return {
    id: c.id,
    epoch: Number(c.epoch),
    stateRoot: c.stateRoot,
    bridger: c.bridger,
    timestamp: Number(c.timestamp),
    txHash: c.txHash,
    challenged: c.challenged,
    verified: c.verified,
    challenge: c.challenge.map((ch) => ({
      txHash: ch.txHash,
      timestamp: Number(ch.timestamp),
      challenger: ch.challenger,
    })),
    verification: c.verification.map((v) => ({
      startTimestamp: v.startTimestamp !== null ? Number(v.startTimestamp) : undefined,
      startCaller: v.startCaller ?? undefined,
      startTxHash: v.startTxHash ?? undefined,
      verifiedTimestamp: v.verifiedTimestamp !== null ? Number(v.verifiedTimestamp) : undefined,
      verifiedCaller: v.verifiedCaller ?? undefined,
      verifiedTxHash: v.verifiedTxHash ?? undefined,
    })),
  };
}

function toRow(route: VeaRoute, epoch: number, snapshot: VeaSnapshot | null, claim: VeaClaim | null): VeaEpochRow {
  return { route, epoch, snapshot, claim, status: deriveStatus(snapshot, claim) };
}

/** Per-route cap on fetched snapshots — mirrors Home.tsx's fetch-a-bounded-window,
 *  then-paginate-client-side pattern rather than server-side offset pagination
 *  (Envio's HyperIndex GraphQL API has no `_aggregate` support at all, confirmed
 *  via introspection against a live indexer, so there's no total count to page
 *  against server-side either way). Generous relative to real snapshot cadence
 *  (roughly one every 1-2 days per route in observed data). */
const SNAPSHOT_WINDOW = 200;

async function fetchRouteSnapshots(route: VeaRoute): Promise<VeaSnapshot[] | null> {
  const query = `
    query GetSnapshots($inbox: String!, $limit: Int!) {
      Snapshot(
        where: { inbox_id: { _eq: $inbox }, saved: { _eq: true } }
        order_by: { timestamp: desc }
        limit: $limit
      ) { ${SNAPSHOT_FIELDS} }
    }
  `;
  const data = await gql<{ Snapshot: RawSnapshot[] }>(INBOX_URL, query, {
    inbox: route.inboxAddress,
    limit: SNAPSHOT_WINDOW,
  });
  return data ? data.Snapshot.map(toSnapshot) : null;
}

/**
 * Fetches the recent window of epochs across one or more routes (one inbox
 * query per route, in parallel) and merges them into a single list sorted
 * newest-first — used for both a single selected route and the "All Chains"
 * merged view. Claims are then batch-fetched one query per *distinct outbox*
 * among the matched routes, not one query overall: epoch numbers are only
 * unique within a single outbox, so merging routes without this would let a
 * claim from one bridge get matched to an unrelated epoch on another.
 */
export async function fetchEpochs(routes: VeaRoute[]): Promise<VeaEpochRow[] | null> {
  if (routes.length === 0) return [];

  const perRoute = await Promise.all(
    routes.map(async (route) => ({ route, snapshots: await fetchRouteSnapshots(route) }))
  );
  const succeeded = perRoute.filter((r): r is { route: VeaRoute; snapshots: VeaSnapshot[] } => r.snapshots !== null);
  if (succeeded.length === 0) return null;

  const entries = succeeded.flatMap(({ route, snapshots }) =>
    snapshots
      .filter((s): s is VeaSnapshot & { epoch: number } => s.epoch !== undefined)
      .map((snapshot) => ({ route, epoch: snapshot.epoch, snapshot }))
  );

  const epochsByOutbox = new Map<string, Set<number>>();
  for (const entry of entries) {
    const set = epochsByOutbox.get(entry.route.outboxAddress);
    if (set) set.add(entry.epoch);
    else epochsByOutbox.set(entry.route.outboxAddress, new Set([entry.epoch]));
  }

  const claimQuery = `
    query GetClaims($outbox: String!, $epochs: [numeric!]!) {
      Claim(where: { outbox_id: { _eq: $outbox }, epoch: { _in: $epochs } }) { ${CLAIM_FIELDS} }
    }
  `;
  const outboxEntries = [...epochsByOutbox.entries()];
  const claimResults = await Promise.all(
    outboxEntries.map(([outboxAddress, epochs]) =>
      gql<{ Claim: RawClaim[] }>(OUTBOX_URL, claimQuery, { outbox: outboxAddress, epochs: [...epochs].map(String) })
    )
  );
  const claimByKey = new Map<string, VeaClaim>();
  outboxEntries.forEach(([outboxAddress], i) => {
    for (const rawClaim of claimResults[i]?.Claim ?? []) {
      const claim = toClaim(rawClaim);
      claimByKey.set(`${outboxAddress}_${claim.epoch}`, claim);
    }
  });

  return entries
    .map(({ route, epoch, snapshot }) =>
      toRow(route, epoch, snapshot, claimByKey.get(`${route.outboxAddress}_${epoch}`) ?? null)
    )
    .sort((a, b) => (b.snapshot?.timestamp ?? 0) - (a.snapshot?.timestamp ?? 0));
}

export interface EpochDetail {
  row: VeaEpochRow;
  messages: VeaMessageRow[];
}

/**
 * Fetches a single epoch's Snapshot + Claim, plus every Message in that
 * snapshot, each annotated Executed/Pending by matching the inbox message's
 * nonce (parsed from its id, `${inboxAddress}-${nonce}`) against an outbox
 * Message with id `${outboxAddress}-${nonce}` — msgId and nonce are the
 * same sequential index, per VeaOutbox's own docstring on `_msgId`.
 */
export async function fetchEpochDetail(route: VeaRoute, epoch: number): Promise<EpochDetail | null> {
  const snapshotQuery = `
    query GetSnapshot($inbox: String!, $epoch: numeric!) {
      Snapshot(where: { inbox_id: { _eq: $inbox }, epoch: { _eq: $epoch } }, limit: 1) { ${SNAPSHOT_FIELDS} }
    }
  `;
  const snapshotData = await gql<{ Snapshot: RawSnapshot[] }>(INBOX_URL, snapshotQuery, {
    inbox: route.inboxAddress,
    epoch: String(epoch),
  });
  if (!snapshotData || snapshotData.Snapshot.length === 0) return null;
  const snapshot = toSnapshot(snapshotData.Snapshot[0]);

  const claimQuery = `
    query GetClaim($outbox: String!, $epoch: numeric!) {
      Claim(where: { outbox_id: { _eq: $outbox }, epoch: { _eq: $epoch } }, limit: 1) { ${CLAIM_FIELDS} }
    }
  `;
  const claimData = await gql<{ Claim: RawClaim[] }>(OUTBOX_URL, claimQuery, {
    outbox: route.outboxAddress,
    epoch: String(epoch),
  });
  const claim = claimData?.Claim[0] ? toClaim(claimData.Claim[0]) : null;

  const messagesQuery = `
    query GetMessages($snapshot: String!) {
      Message(where: { snapshot_id: { _eq: $snapshot } }, order_by: { timestamp: asc }) {
        id txHash timestamp from to
      }
    }
  `;
  const messagesData = await gql<{
    Message: { id: string; txHash: string; timestamp: string; from: string; to: string }[];
  }>(INBOX_URL, messagesQuery, { snapshot: snapshot.id });
  const inboxMessages = messagesData?.Message ?? [];

  const outboxIds = inboxMessages.map((m) => `${route.outboxAddress}-${m.id.split("-")[1]}`);
  const relayedData =
    outboxIds.length > 0
      ? await gql<{ Message: { id: string; txHash: string; relayer: string }[] }>(
          OUTBOX_URL,
          `query GetRelayed($ids: [String!]!) { Message(where: { id: { _in: $ids } }) { id txHash relayer } }`,
          { ids: outboxIds }
        )
      : null;
  const relayedById = new Map((relayedData?.Message ?? []).map((m) => [m.id, m]));

  const messages: VeaMessageRow[] = inboxMessages.map((m) => {
    const nonce = m.id.split("-")[1];
    const relayed = relayedById.get(`${route.outboxAddress}-${nonce}`);
    return {
      id: m.id,
      nonce: Number(nonce),
      txHash: m.txHash,
      timestamp: Number(m.timestamp),
      from: m.from,
      to: m.to,
      executed: !!relayed,
      relayedTxHash: relayed?.txHash,
      relayer: relayed?.relayer,
    };
  });

  return { row: toRow(route, epoch, snapshot, claim), messages };
}
