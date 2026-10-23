import request from "graphql-request";
import { DispatchedTxnData, HashiMessageExecutionVars } from "./hashiTypes";
import { DataError, MissingEnvironmentVariable } from "../errors";

const DEFAULT_BATCH_SIZE = 10;
// Page size of the boundary block query. The server may cap a page below it, so only an empty page ends the read
const BLOCK_PAGE_SIZE = 100;

interface EnvioMessageDispatched {
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

interface EnvioDispatchedResponse {
  MessageDispatched: EnvioMessageDispatched[];
  chain_metadata: { latest_processed_block: number }[];
}

const messageDispatchedFields = `
      messageId
      txHash
      sourceChainId
      yaho
      nonce
      targetChainId
      threshold
      sender
      receiver
      data
      reporters
      adapters
      blockNumber
      blockTimestamp
`;

const dispatchedMessagesQuery = `
  query DispatchedMessages($sourceChainId: numeric!, $targetChainId: numeric!, $chainId: Int!, $yaho: String!, $fromBlock: numeric!, $limit: Int!) {
    MessageDispatched(
      where: {
        sourceChainId: { _eq: $sourceChainId }
        targetChainId: { _eq: $targetChainId }
        yaho: { _ilike: $yaho }
        blockNumber: { _gt: $fromBlock }
      }
      order_by: { blockNumber: asc }
      limit: $limit
    ) {${messageDispatchedFields}    }
    chain_metadata(where: { chain_id: { _eq: $chainId } }) {
      latest_processed_block
    }
  }
`;

const blockMessagesQuery = `
  query BlockDispatchedMessages($sourceChainId: numeric!, $targetChainId: numeric!, $yaho: String!, $blockNumber: numeric!, $limit: Int!, $offset: Int!) {
    MessageDispatched(
      where: {
        sourceChainId: { _eq: $sourceChainId }
        targetChainId: { _eq: $targetChainId }
        yaho: { _ilike: $yaho }
        blockNumber: { _eq: $blockNumber }
      }
      order_by: { nonce: asc }
      limit: $limit
      offset: $offset
    ) {${messageDispatchedFields}    }
  }
`;

/**
 * Map an Envio MessageDispatched row to the executor's HashiMessageExecutionVars shape.
 * @param row The raw MessageDispatched entity returned by the Envio indexer
 * @returns The HashiMessageExecutionVars for the executor
 */
function toHashiMessageExecutionVars(row: EnvioMessageDispatched): HashiMessageExecutionVars {
  return {
    txHash: row.txHash,
    timestamp: Number(row.blockTimestamp),
    blockNumber: Number(row.blockNumber),
    messageId: BigInt(row.messageId),
    message: {
      nonce: Number(row.nonce),
      sender: row.sender,
      targetChainId: Number(row.targetChainId),
      receiver: row.receiver,
      threshold: Number(row.threshold),
      data: row.data,
      reporters: JSON.parse(row.reporters),
      adapters: JSON.parse(row.adapters),
    },
  };
}

/**
 * Get MessageDispatched events from the Envio Yaho indexer starting after a specific block
 * @param sourceChainId The chain ID of the Yaho (source) chain
 * @param targetChainId The chain ID the messages are destined for; other routes' messages are excluded
 * @param yahoAddress The Yaho contract address
 * @param fromBlock The last processed block number; only events strictly after it are returned
 * @param batchSize The number of messages to fetch (default: 10); a full batch also takes the rest of its last block,
 *   so it can return more
 * @returns The dispatched messages and the block number to checkpoint in the state file
 */
async function getDispatchedMessagesFromEnvio(
  sourceChainId: number,
  targetChainId: number,
  yahoAddress: string,
  fromBlock: number,
  batchSize = DEFAULT_BATCH_SIZE
): Promise<DispatchedTxnData> {
  const envioEndpoint = process.env.RELAYER_ENVIO_YAHO;
  if (!envioEndpoint) {
    throw new MissingEnvironmentVariable("RELAYER_ENVIO_YAHO");
  }
  try {
    const result = (await request(envioEndpoint, dispatchedMessagesQuery, {
      sourceChainId,
      targetChainId,
      chainId: sourceChainId,
      yaho: yahoAddress,
      fromBlock,
      limit: batchSize,
    })) as EnvioDispatchedResponse;

    let txns = result.MessageDispatched.map(toHashiMessageExecutionVars);

    // A full batch may have been truncated mid-range, even inside its last block, so complete that block and
    // checkpoint it; otherwise the indexer head is safe to checkpoint.
    const indexerHead = result.chain_metadata[0]?.latest_processed_block;
    let toBlock = fromBlock;
    if (txns.length === batchSize) {
      toBlock = txns[txns.length - 1].blockNumber;
      const blockRows = await fetchBlockMessages(envioEndpoint, sourceChainId, targetChainId, yahoAddress, toBlock);
      txns = [...txns.filter((txn) => txn.blockNumber < toBlock), ...blockRows.map(toHashiMessageExecutionVars)];
    } else if (indexerHead !== undefined) {
      toBlock = Math.max(indexerHead, fromBlock);
    } else if (txns.length > 0) {
      toBlock = txns[txns.length - 1].blockNumber;
    }

    return { txns, toBlock };
  } catch (e) {
    throw new DataError("Failed to fetch dispatched messages (envio)", sourceChainId, "hashi", { cause: e });
  }
}

/**
 * Get every MessageDispatched event of this route in one block, page by page until an empty page.
 * @param envioEndpoint The Envio GraphQL endpoint
 * @param blockNumber The block to read in full
 * @returns The block's rows, in nonce order
 */
async function fetchBlockMessages(
  envioEndpoint: string,
  sourceChainId: number,
  targetChainId: number,
  yahoAddress: string,
  blockNumber: number
): Promise<EnvioMessageDispatched[]> {
  const rows: EnvioMessageDispatched[] = [];
  for (;;) {
    const page = (await request(envioEndpoint, blockMessagesQuery, {
      sourceChainId,
      targetChainId,
      yaho: yahoAddress,
      blockNumber,
      limit: BLOCK_PAGE_SIZE,
      offset: rows.length,
    })) as Pick<EnvioDispatchedResponse, "MessageDispatched">;
    if (page.MessageDispatched.length === 0) {
      return rows;
    }
    rows.push(...page.MessageDispatched);
  }
}

export { getDispatchedMessagesFromEnvio, toHashiMessageExecutionVars, EnvioMessageDispatched };
