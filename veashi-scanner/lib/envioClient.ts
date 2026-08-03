import type { Message } from "./types";

// Both the local Envio dev instance and Envio Cloud expose a public,
// unauthenticated read role for queries — no Hasura admin secret is required
// (and none should ever ship to the browser).
const ENVIO_URL = import.meta.env.VITE_ENVIO_URL ?? "http://localhost:8080/v1/graphql";

const FETCH_TIMEOUT_MS = 5_000;

const MESSAGE_FIELDS = `
  id messageId txHash sourceChainId yaho nonce targetChainId
  threshold sender receiver data reporters adapters blockNumber blockTimestamp
`;

const TX_HASH_QUERY = `
  query GetMessageByTxHash($txHash: String!) {
    MessageDispatched(where: { txHash: { _eq: $txHash } }, limit: 1) {
      ${MESSAGE_FIELDS}
    }
  }
`;

interface EnvioMessage {
  id: string;
  messageId: string;
  txHash: string;
  sourceChainId: string;
  yaho: string;
  nonce: string;
  targetChainId: string;
  threshold: string;
  sender: string;
  receiver: string;
  data: string;
  reporters: string;
  adapters: string;
  blockNumber: string;
  blockTimestamp: string;
}

function toMessage(e: EnvioMessage): Message {
  return {
    txHash: e.txHash.toLowerCase(),
    sourceChain: Number(e.sourceChainId),
    destinationChain: Number(e.targetChainId),
    thresholdRequired: Number(e.threshold),
    thresholdCurrent: 0,
    sourceAddress: e.sender,
    destinationAddress: e.receiver,
    blockNumber: Number(e.blockNumber),
    blockTimestamp: Number(e.blockTimestamp),
    messageId: e.messageId,
    nonce: Number(e.nonce),
    adapters: JSON.parse(e.adapters) as string[],
    reporters: JSON.parse(e.reporters) as string[],
    data: e.data,
  };
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ENVIO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    console.log("GraphQL response:", json);
    if (json.errors) return null;
    return json.data as T;
  } catch (err) {
    console.error("GraphQL request failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchMessagesOptions {
  sourceChainId?: number;
  destinationChainId?: number;
  limit?: number;
  offset?: number;
}

/**
 * Fetch the latest MessageDispatched records from the envio indexer,
 * sorted newest-first. Optionally filtered by source and/or destination chain.
 *
 * Returns null when the indexer is unreachable or returns a GraphQL error.
 */
export async function fetchMessagesFromEnvio(opts: FetchMessagesOptions): Promise<Message[] | null> {
  const conditions: string[] = [];
  const variables: Record<string, unknown> = {
    limit: opts.limit ?? 10,
    offset: opts.offset ?? 0,
  };

  if (opts.sourceChainId !== undefined) {
    conditions.push("{ sourceChainId: { _eq: $sourceChainId } }");
    variables.sourceChainId = String(opts.sourceChainId);
  }
  if (opts.destinationChainId !== undefined) {
    conditions.push("{ targetChainId: { _eq: $targetChainId } }");
    variables.targetChainId = String(opts.destinationChainId);
  }

  const whereClause = conditions.length > 0 ? `where: { _and: [${conditions.join(", ")}] }` : "";

  const varDecls = ["$limit: Int", "$offset: Int"];
  if (opts.sourceChainId !== undefined) varDecls.push("$sourceChainId: numeric");
  if (opts.destinationChainId !== undefined) varDecls.push("$targetChainId: numeric");

  const query = `
    query GetMessages(${varDecls.join(", ")}) {
      MessageDispatched(
        ${whereClause}
        order_by: { blockTimestamp: desc }
        limit: $limit
        offset: $offset
      ) { ${MESSAGE_FIELDS} }
    }
  `;

  const data = await gql<{ MessageDispatched: EnvioMessage[] }>(query, variables);
  if (!data) return null;
  return data.MessageDispatched.map(toMessage);
}

/**
 * Fetch a single MessageDispatched record by transaction hash.
 * Returns null when the indexer is unreachable or the tx is not indexed yet.
 */
export async function fetchMessageByTxHash(txHash: string): Promise<Message | null> {
  const data = await gql<{ MessageDispatched: EnvioMessage[] }>(TX_HASH_QUERY, { txHash: txHash.toLowerCase() });
  if (!data || data.MessageDispatched.length === 0) return null;
  return toMessage(data.MessageDispatched[0]);
}
