import { EventEmitter } from "node:events";
import { Interface, getAddress, Contract, Wallet, isHexString, getBytes, Log, Provider } from "ethers";
import { getHashiMsgId, toPlainMessage } from "./hashiHelpers/hashiMsgUtils";
import { messageDispatchedAbi, thresholdViewAbi, YaruAbi } from "./hashiHelpers/abi";
import { BotEvents } from "./botEvents";
import {
  HashiExecutionStatus,
  HashiMessage,
  HashiMessageState,
  HashiMessageExecutionVars,
  DispatchedTxnData,
} from "./hashiHelpers/hashiTypes";
import { getHashiBridgeConfig } from "./hashiHelpers/bridgeRoutes";
import { getDispatchedMessagesFromEnvio } from "./hashiHelpers/envioQueries";
import { getStartBlockNumber, readPendingMessages, updateHashiStateFile } from "./hashiHelpers/stateFile";
import { FallbackRpcProvider } from "./fallbackProvider";
import { ExecutionError, MissingEnvironmentVariable } from "./errors";
import { classifyPreflightError, PreflightFailure } from "./hashiHelpers/revertClass";
import { classifyCallFailure, isMessageSpecific } from "./revertClassifier";

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const MAX_BATCH_SIZE = 10;
const MAX_BLOCKS_CYCLE = 1_000_000;
const MAX_PENDING_TIME_SECONDS = 60 * 60 * 24 * 7; // 1 week
const TX_CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_MESSAGES_PER_TX = 20;

interface HashiExecutorInterface {
  sourceChainId: number;
  targetChainId: number;
  network: string;
  emitter: EventEmitter;
  fetchBridgeConfig?: typeof getHashiBridgeConfig;
  fetchAllMessageLogs?: typeof getDispatchedTxns;
  isMessageExecutable?: typeof toExecuteMessage;
  executeMsgsOnHashi?: typeof executeBatchOnHashi;
  fetchStartBlockNumber?: typeof getStartBlockNumber;
  fetchPendingMessages?: typeof readPendingMessages;
  updateStateFile?: typeof updateHashiStateFile;
}

type ExecutableEntry = { record: HashiMessageExecutionVars; hashiMessage: HashiMessage };
type ClassifiedMessages = { executable: ExecutableEntry[]; pending: HashiMessageExecutionVars[] };

const toUrls = (rpc: string | string[]) => (Array.isArray(rpc) ? rpc : [rpc]);
const isWithinPendingWindow = (record: HashiMessageExecutionVars, nowSec: number) =>
  record.timestamp + MAX_PENDING_TIME_SECONDS >= nowSec;

/**
 * Run the Hashi executor to process and execute messages.
 * @param chainId The chain ID
 * @param network The network name
 * @param nonce The starting Vea msg nonce
 * @param emitter The event emitter
 * @param fetchBridgeConfig Function to fetch bridge configuration
 * @param fetchVeaInbox Function to fetch Vea Inbox contract instance
 * @param isMessageExecutable Function to check if a message is executable
 * @param executeMsgsOnHashi Function to execute messages on Hashi
 * @returns The updated nonce after processing
 */
async function runHashiExecutor({
  sourceChainId,
  targetChainId,
  emitter,
  fetchBridgeConfig = getHashiBridgeConfig,
  fetchAllMessageLogs = getDispatchedTxns,
  isMessageExecutable = toExecuteMessage,
  executeMsgsOnHashi = executeBatchOnHashi,
  fetchStartBlockNumber = getStartBlockNumber,
  fetchPendingMessages = readPendingMessages,
  updateStateFile = updateHashiStateFile,
}: HashiExecutorInterface): Promise<number> {
  const bridgeConfig = fetchBridgeConfig(sourceChainId, targetChainId);
  const { yaruAddress, yahoAddress, hashiAddress, sourceRPC, targetRPC } = bridgeConfig;
  const legacyBlockNumber = await fetchStartBlockNumber(sourceChainId, targetChainId, "hashi", emitter);

  if (!yaruAddress || !yahoAddress || !hashiAddress || !sourceRPC || !targetRPC) {
    emitter.emit(BotEvents.HASHI_NOT_CONFIGURED, targetChainId);
    throw new MissingEnvironmentVariable(`Hashi bridge ${sourceChainId} -> ${targetChainId} (addresses or RPC env)`);
  }
  const localMessages: HashiMessageExecutionVars[] = await fetchPendingMessages(sourceChainId, targetChainId, "hashi");
  const { txns, toBlock } = await fetchAllMessageLogs(
    sourceChainId,
    targetChainId,
    sourceRPC,
    yahoAddress,
    legacyBlockNumber,
    emitter
  );
  const nowSec = Math.floor(Date.now() / 1000);
  // A rescan can return a message that is also saved as pending; classify and execute each message once
  const { executable, pending } = await classifyMessages(uniqueByMessageId([...txns, ...localMessages]), {
    sourceChainId,
    targetChainId,
    emitter,
    isMessageExecutable,
    nowSec,
  });

  if (executable.length > 0) {
    const hashiMessages = executable.map((entry) => entry.hashiMessage);
    emitter.emit(BotEvents.EXECUTING_HASHI, hashiMessages[0].nonce, hashiMessages[hashiMessages.length - 1].nonce);
    const keptNonces = await executeMsgsOnHashi(sourceChainId, targetChainId, hashiMessages, emitter);
    emitter.emit(BotEvents.HASHI_EXECUTED, toBlock);
    pending.push(...keptRecords(executable, keptNonces ?? [], nowSec));
  }
  await updateStateFile(
    sourceChainId,
    targetChainId,
    Math.floor(Date.now() / 1000),
    toBlock,
    pending,
    "hashi",
    emitter
  );

  return toBlock;
}

/**
 * Drop repeated messages, keeping the first record seen for each messageId.
 * @param records The scanned records followed by the saved pending records
 * @returns The records in their original order, one per messageId
 */
function uniqueByMessageId(records: HashiMessageExecutionVars[]): HashiMessageExecutionVars[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = String(record.messageId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface ClassifyContext {
  sourceChainId: number;
  targetChainId: number;
  emitter: EventEmitter;
  isMessageExecutable: typeof toExecuteMessage;
  nowSec: number;
}

/**
 * Check every record of this route and split them into executable messages and messages to keep pending.
 * @param records The deduplicated scanned and saved records
 * @returns The executable entries (with their records) and the records still waiting for the threshold
 */
async function classifyMessages(
  records: HashiMessageExecutionVars[],
  { sourceChainId, targetChainId, emitter, isMessageExecutable, nowSec }: ClassifyContext
): Promise<ClassifiedMessages> {
  const classified: ClassifiedMessages = { executable: [], pending: [] };
  for (const record of records) {
    // Shared Yahos dispatch for multiple routes; only this route's messages are executable on its Yaru
    if (Number(record.message.targetChainId) !== targetChainId) {
      continue;
    }
    const messageState = await isMessageExecutable({ sourceChainId, hashiMessage: record.message, emitter });
    addClassified(classified, record, messageState, nowSec);
  }
  return classified;
}

function addClassified(
  classified: ClassifiedMessages,
  record: HashiMessageExecutionVars,
  messageState: HashiMessageState | null,
  nowSec: number
) {
  if (messageState === null) {
    // The threshold check reverted or aborted for this message; retry it next cycle, as a failed Yaru preflight is
    if (isWithinPendingWindow(record, nowSec)) {
      classified.pending.push(record);
    }
    return;
  }
  if (messageState.executable) {
    classified.executable.push({ record, hashiMessage: messageState.hashiMessage });
  } else if (messageState.status === HashiExecutionStatus.THRESHOLD_NOT_MET && isWithinPendingWindow(record, nowSec)) {
    classified.pending.push(record);
  }
}

/**
 * Map the nonces kept by the preflight back to their saved records, so they keep their dispatch timestamp.
 * @param executable The entries passed to the executor
 * @param keptNonces The nonces executeBatchOnHashi did not execute but must retry
 * @param nowSec The current unix time in seconds
 * @returns The kept records still within the pending window
 */
function keptRecords(
  executable: ExecutableEntry[],
  keptNonces: (bigint | number)[],
  nowSec: number
): HashiMessageExecutionVars[] {
  const kept = new Set(keptNonces.map((nonce) => BigInt(nonce).toString()));
  return executable
    .filter(({ hashiMessage }) => kept.has(BigInt(hashiMessage.nonce).toString()))
    .map(({ record }) => record)
    .filter((record) => isWithinPendingWindow(record, nowSec));
}

type YaruMessage = {
  nonce: bigint;
  targetChainId: bigint;
  threshold: bigint;
  sender: string;
  receiver: string;
  data: string | Uint8Array;
  reporters: string[];
  adapters: string[];
};

interface YaruExecutor {
  executeMessages: {
    (messages: YaruMessage[]): Promise<{ wait(confirms?: number, timeout?: number): Promise<{ hash: string } | null> }>;
    staticCall(messages: YaruMessage[]): Promise<unknown>;
  };
}

function connectYaru(sourceChainId: number, targetChainId: number, emitter: EventEmitter): YaruExecutor {
  const { yaruAddress, targetRPC } = getHashiBridgeConfig(sourceChainId, targetChainId);
  const provider = new FallbackRpcProvider(toUrls(targetRPC), emitter, targetChainId);
  const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
  return new Contract(yaruAddress, YaruAbi, signer) as unknown as YaruExecutor;
}

/** * Execute a batch of messages on Hashi (Yaru contract)
 * @param chainId The chain ID
 * @param params The array of HashiMessageState to execute
 * @param yaru The Yaru contract (injected for testing)
 * @returns The nonces of the messages whose preflight failed and that must stay pending
 */
async function executeBatchOnHashi(
  sourceChainId: number,
  targetChainId: number,
  params: HashiMessage[],
  emitter: EventEmitter,
  yaru: YaruExecutor = connectYaru(sourceChainId, targetChainId, emitter)
): Promise<bigint[]> {
  const keptNonces: bigint[] = [];
  for (let cursor = 0; cursor < params.length; cursor += MAX_MESSAGES_PER_TX) {
    const messages = params.slice(cursor, cursor + MAX_MESSAGES_PER_TX).map(toYaruMessage);
    const { passed, kept } = await preflightMessages(yaru, messages, sourceChainId, targetChainId, emitter);
    keptNonces.push(...kept);
    if (passed.length > 0) {
      await sendYaruBatch(yaru, passed, sourceChainId, targetChainId, emitter);
    }
  }
  return keptNonces;
}

function toYaruMessage(hashiMessage: HashiMessage): YaruMessage {
  let dataBytes: string | Uint8Array = hashiMessage.data;
  if (typeof dataBytes === "string") {
    if (dataBytes === "" || dataBytes === "0x") {
      dataBytes = new Uint8Array([]);
    } else if (!isHexString(dataBytes)) {
      dataBytes = getBytes(dataBytes);
    }
  } else {
    // ensure it is a Uint8Array
    dataBytes = new Uint8Array(dataBytes);
  }

  const reporters = Array.isArray(hashiMessage.reporters) ? [...hashiMessage.reporters] : hashiMessage.reporters;

  const adapters = Array.isArray(hashiMessage.adapters) ? [...hashiMessage.adapters] : hashiMessage.adapters;

  return {
    nonce: BigInt(hashiMessage.nonce),
    targetChainId: BigInt(hashiMessage.targetChainId),
    threshold: BigInt(hashiMessage.threshold),
    sender: hashiMessage.sender,
    receiver: hashiMessage.receiver,
    data: dataBytes,
    reporters,
    adapters,
  };
}

/**
 * Check each message alone before sending the batch, so one failing message does not revert the others.
 * Only a message another party already executed is dropped; a receiver revert (CallFailed), any other revert and
 * a transport failure keep the message pending for the next cycle.
 * @returns The messages that passed and the nonces to keep pending
 */
async function preflightMessages(
  yaru: YaruExecutor,
  messages: YaruMessage[],
  sourceChainId: number,
  targetChainId: number,
  emitter: EventEmitter
): Promise<{ passed: YaruMessage[]; kept: bigint[] }> {
  const passed: YaruMessage[] = [];
  const kept: bigint[] = [];
  for (const message of messages) {
    try {
      await yaru.executeMessages.staticCall([message]);
      passed.push(message);
    } catch (error) {
      emitter.emit(
        BotEvents.HASHI_MESSAGE_FAILING,
        message.nonce.toString(),
        sourceChainId.toString(),
        targetChainId.toString(),
        error
      );
      if (classifyPreflightError(error) !== PreflightFailure.ALREADY_EXECUTED) {
        kept.push(message.nonce);
      }
    }
  }
  return { passed, kept };
}

async function sendYaruBatch(
  yaru: YaruExecutor,
  messages: YaruMessage[],
  sourceChainId: number,
  targetChainId: number,
  emitter: EventEmitter
) {
  // Throw on send/confirmation failure so the caller does not checkpoint past unexecuted messages
  try {
    const tx = await yaru.executeMessages(messages);
    const receipt = await tx.wait(1, TX_CONFIRM_TIMEOUT_MS);
    emitter.emit(BotEvents.HASHI_BATCH_TXN, receipt.hash, messages.length);
  } catch (error) {
    emitter.emit(BotEvents.HASHI_BATCH_FAILED, sourceChainId, targetChainId, messages.length, error);
    throw new ExecutionError("executeMessages batch (hashi)", targetChainId, "hashi", { cause: error });
  }
}

interface ToExecuteMessageInterface {
  sourceChainId: number;
  hashiMessage: HashiMessage;
  emitter: EventEmitter;
  hasThresholdMet?: typeof getMessageStatus;
}
/**
 * Check if a message is executable on Hashi by verifying if the threshold is met.
 * A threshold check that reverts (or aborts in the VM) is specific to this message, for example an adapter
 * without getHash, so the message is skipped this cycle and kept pending within the one-week window (a VM abort can
 * come from one node's limits, and an adapter can be fixed later); a failure not tied to the message (transport, or a
 * failure the classifier cannot place) is rethrown so the route retries.
 * @param chainId The chain ID
 * @param nonce The message nonce
 * @param inboxAddress The Vea Inbox address
 * @param rpcInbox The RPC URL for the inbox network
 * @returns The HashiMessageState, or null when the threshold check reverted
 */
async function toExecuteMessage({
  sourceChainId,
  hashiMessage,
  emitter,
  hasThresholdMet = getMessageStatus,
}: ToExecuteMessageInterface): Promise<HashiMessageState | null> {
  let msgStatus: HashiExecutionStatus;
  try {
    msgStatus = await hasThresholdMet(sourceChainId, hashiMessage, emitter);
  } catch (error) {
    if (!isMessageSpecific(classifyCallFailure(error))) {
      throw error;
    }
    emitter.emit(
      BotEvents.HASHI_MESSAGE_FAILING,
      String(hashiMessage.nonce),
      sourceChainId.toString(),
      String(hashiMessage.targetChainId),
      error
    );
    return null;
  }
  const msgState: HashiMessageState = {
    hashiMessage,
    executable: false,
    status: msgStatus,
  };
  if (msgStatus === HashiExecutionStatus.EXECUTABLE) {
    msgState.executable = true;
  }
  return msgState;
}

type CallProvider = Pick<Provider, "call">;

/** * Get the message status for threshold and execution on Hashi.
 * @param message The HashiMessage to check
 * @param bridgeConfig The route's bridge configuration (injected for testing)
 * @param provider The target chain provider (injected for testing)
 * @returns The HashiExecutionStatus indicating if the message is executable or already executed
 */
async function getMessageStatus(
  sourceChainId: number,
  message: HashiMessage,
  emitter: EventEmitter,
  bridgeConfig = getHashiBridgeConfig(sourceChainId, Number(message.targetChainId)),
  provider: CallProvider = new FallbackRpcProvider(
    toUrls(bridgeConfig.targetRPC),
    emitter,
    Number(message.targetChainId)
  )
): Promise<HashiExecutionStatus> {
  const id = getHashiMsgId(sourceChainId, bridgeConfig.yahoAddress!, message); // bytes32
  const ok = await isThresholdMet(provider, bridgeConfig.hashiAddress, sourceChainId, id, message);
  if (!ok) {
    return HashiExecutionStatus.THRESHOLD_NOT_MET;
  }
  const executed = await isExecutedOnYaru(provider, bridgeConfig.yaruAddress, id, Number(message.targetChainId));
  return executed ? HashiExecutionStatus.EXECUTED : HashiExecutionStatus.EXECUTABLE;
}

async function isThresholdMet(
  provider: CallProvider,
  hashiAddress: string,
  sourceChainId: number,
  id: BigInt,
  message: HashiMessage
): Promise<boolean> {
  const iface = new Interface(thresholdViewAbi);
  const domain = BigInt(sourceChainId); // uint256
  const threshold = BigInt(message.threshold); // uint256
  const adapters = message.adapters.map((address) => getAddress(address)); // address[]
  const data = iface.encodeFunctionData("checkHashWithThresholdFromAdapters", [domain, id, threshold, adapters]);
  const ret = await provider.call({ to: hashiAddress, data });
  const [ok] = iface.decodeFunctionResult("checkHashWithThresholdFromAdapters", ret);
  return ok;
}

// Any failure of this read is a route failure, never a reason to skip the message.
async function isExecutedOnYaru(
  provider: CallProvider,
  yaruAddress: string,
  id: BigInt,
  targetChainId: number
): Promise<boolean> {
  const ifaceYaru = new Interface(YaruAbi);
  try {
    const ret = await provider.call({ to: yaruAddress, data: ifaceYaru.encodeFunctionData("executed", [id]) });
    const [flag] = ifaceYaru.decodeFunctionResult("executed", ret);
    return flag;
  } catch (error) {
    throw new ExecutionError("Yaru.executed read (hashi)", targetChainId, "hashi", { cause: error });
  }
}

type LogScanProvider = Pick<Provider, "getBlock" | "getLogs">;

/**
 * Split the blocks after the checkpoint into getLogs ranges, up to the finalized head and at most MAX_BLOCKS_CYCLE blocks.
 * @param fromBlock The last block already scanned
 * @param finalizedHead The latest finalized block
 * @param chunkSize The number of blocks per range
 * @returns The inclusive [start, end] ranges in ascending order, empty when the head is at or below fromBlock
 */
function chunkBounds(fromBlock: number, finalizedHead: number, chunkSize: number): [number, number][] {
  const last = Math.min(finalizedHead, fromBlock + MAX_BLOCKS_CYCLE);
  const chunks: [number, number][] = [];
  for (let start = fromBlock + 1; start <= last; start += chunkSize) {
    chunks.push([start, Math.min(start + chunkSize - 1, last)]);
  }
  return chunks;
}

/**
 * Get all MessageDispatched logs from Yaho contract after a specific block
 * @param chainId The chain ID of the Yaho (source) chain
 * @param targetChainId The chain ID the messages are destined for; other routes' messages are excluded
 * @param providerRPC The RPC URL(s) for the source network
 * @param yahoAddress The Yaho contract address
 * @param fromBlock The last block already scanned; the scan starts at the next block
 * @param chunkSize The number of blocks to fetch in each chunk (default: 10,000)
 * @param cooldownMs The cooldown time in milliseconds between chunk fetches (default: 1000ms)
 * @param provider The source chain provider (injected for testing)
 * @returns The route's messages and the last block actually scanned (fromBlock when nothing was scanned)
 */
async function getAllMessageDispatchedLogs(
  chainId: number,
  targetChainId: number,
  providerRPC: string[] | string,
  yahoAddress: string,
  fromBlock: number,
  emitter: EventEmitter,
  chunkSize = 10_000, // RPC’s max range
  cooldownMs = 1000,
  provider: LogScanProvider = new FallbackRpcProvider(toUrls(providerRPC), emitter, chainId)
): Promise<DispatchedTxnData> {
  const latestFinalized = await provider.getBlock("finalized");
  const chunks = chunkBounds(fromBlock, latestFinalized!.number, chunkSize);
  emitter.emit(BotEvents.INDEXING, fromBlock, chunks.length > 0 ? chunks[chunks.length - 1][1] : fromBlock);
  const topic0 = new Interface(messageDispatchedAbi).getEvent("MessageDispatched").topicHash;

  const all: HashiMessageExecutionVars[] = [];
  let scannedTo = fromBlock;
  // Stop early once a batch is collected, and checkpoint only the chunks actually scanned
  for (let i = 0; i < chunks.length && all.length < MAX_BATCH_SIZE; i++) {
    const [start, end] = chunks[i];
    if (i > 0 && cooldownMs > 0) {
      await sleep(cooldownMs);
    }
    const logs = await provider.getLogs({ address: yahoAddress, fromBlock: start, toBlock: end, topics: [topic0] });
    all.push(...(await decodeRouteLogs(logs, yahoAddress, targetChainId, provider)));
    scannedTo = end;
  }

  all.sort((a, b) => a.blockNumber - b.blockNumber);
  return { txns: all, toBlock: scannedTo };
}

/**
 * Decode the Yaho logs destined for this route into records with a plain message.
 * @returns The records, in log order
 */
async function decodeRouteLogs(
  logs: Log[],
  yahoAddress: string,
  targetChainId: number,
  provider: LogScanProvider
): Promise<HashiMessageExecutionVars[]> {
  const iface = new Interface(messageDispatchedAbi);
  const records: HashiMessageExecutionVars[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== yahoAddress.toLowerCase()) {
      continue;
    }
    const { messageId, message } = iface.parseLog(log).args as any;
    if (Number(message.targetChainId) !== targetChainId) {
      continue;
    }
    const block = await provider.getBlock(log.blockNumber);
    records.push({
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      messageId,
      // A plain object: an ethers Result is saved by JSON.stringify as a positional array, losing the field names
      message: toPlainMessage(message),
      timestamp: block.timestamp,
    });
  }
  return records;
}

/**
 * Get MessageDispatched events from the Envio indexer when configured, falling back to RPC log scanning.
 * @param chainId The chain ID of the Yaho (source) chain
 * @param targetChainId The chain ID the messages are destined for; other routes' messages are excluded
 * @param providerRPC The RPC URL(s) for the source network, used for the fallback scan
 * @param yahoAddress The Yaho contract address
 * @param fromBlock The starting block number to fetch messages from
 * @param emitter The event emitter
 * @returns The dispatched messages and the block number to checkpoint in the state file
 */
async function getDispatchedTxns(
  chainId: number,
  targetChainId: number,
  providerRPC: string[] | string,
  yahoAddress: string,
  fromBlock: number,
  emitter: EventEmitter,
  fetchFromEnvio = getDispatchedMessagesFromEnvio,
  fetchFromRPC = getAllMessageDispatchedLogs
): Promise<DispatchedTxnData> {
  if (process.env.RELAYER_ENVIO_YAHO) {
    try {
      emitter.emit(BotEvents.ENVIO_INDEXING, chainId, fromBlock);
      return await fetchFromEnvio(chainId, targetChainId, yahoAddress, fromBlock, MAX_BATCH_SIZE);
    } catch (error) {
      emitter.emit(BotEvents.ENVIO_FAILED, chainId, error);
    }
  }
  return fetchFromRPC(chainId, targetChainId, providerRPC, yahoAddress, fromBlock, emitter);
}

export {
  executeBatchOnHashi,
  runHashiExecutor,
  toExecuteMessage,
  getDispatchedTxns,
  getAllMessageDispatchedLogs,
  getMessageStatus,
  YaruExecutor,
};
