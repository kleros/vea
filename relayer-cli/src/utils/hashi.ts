import { EventEmitter } from "node:events";
import { Interface, getAddress, Contract, Wallet, isHexString, getBytes } from "ethers";
import { getHashiMsgId } from "./hashiHelpers/hashiMsgUtils";
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

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const MAX_BATCH_SIZE = 10;
const MAX_BLOCKS_CYCLE = 1_000_000;
const MAX_PENDING_TIME_SECONDS = 60 * 60 * 24 * 7; // 1 week
const TX_CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;

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
  const pendingMessages: HashiMessageExecutionVars[] = [];
  const localMessages: HashiMessageExecutionVars[] = await fetchPendingMessages(sourceChainId, targetChainId, "hashi");
  const executableMessages: HashiMessage[] = [];
  const { txns, toBlock } = await fetchAllMessageLogs(
    sourceChainId,
    targetChainId,
    sourceRPC,
    yahoAddress,
    legacyBlockNumber,
    emitter
  );
  for (const tx of txns) {
    // Shared Yahos dispatch for multiple routes; only this route's messages are executable on its Yaru
    if (Number(tx.message.targetChainId) !== targetChainId) {
      continue;
    }
    const messageState = await isMessageExecutable({ sourceChainId, hashiMessage: tx.message, emitter });
    if (messageState === null) {
      continue;
    }
    if (messageState.executable) {
      executableMessages.push(messageState.hashiMessage);
    } else if (
      messageState.status === HashiExecutionStatus.THRESHOLD_NOT_MET &&
      tx.timestamp + MAX_PENDING_TIME_SECONDS >= Math.floor(Date.now() / 1000)
    ) {
      pendingMessages.push(tx);
    }
  }
  for (const localMsg of localMessages) {
    if (Number(localMsg.message.targetChainId) !== targetChainId) {
      continue;
    }
    const messageState = await isMessageExecutable({ sourceChainId, hashiMessage: localMsg.message, emitter });
    if (messageState === null) {
      continue;
    }
    if (messageState.executable) {
      executableMessages.push(messageState.hashiMessage);
    } else if (
      messageState.status === HashiExecutionStatus.THRESHOLD_NOT_MET &&
      localMsg.timestamp + MAX_PENDING_TIME_SECONDS >= Math.floor(Date.now() / 1000)
    ) {
      pendingMessages.push(localMsg);
    }
  }

  if (executableMessages.length === 0) {
    await updateStateFile(
      sourceChainId,
      targetChainId,
      Math.floor(Date.now() / 1000),
      toBlock,
      pendingMessages,
      "hashi",
      emitter
    );
    return toBlock;
  }
  emitter.emit(
    BotEvents.EXECUTING_HASHI,
    executableMessages[0].nonce,
    executableMessages[executableMessages.length - 1].nonce
  );
  await executeMsgsOnHashi(sourceChainId, targetChainId, executableMessages, emitter);
  emitter.emit(BotEvents.HASHI_EXECUTED, toBlock);
  await updateStateFile(
    sourceChainId,
    targetChainId,
    Math.floor(Date.now() / 1000),
    toBlock,
    pendingMessages,
    "hashi",
    emitter
  );

  return toBlock;
}

/** * Execute a batch of messages on Hashi (Yaru contract)
 * @param chainId The chain ID
 * @param params The array of HashiMessageState to execute
 * @returns The last nonce processed + 1
 */
async function executeBatchOnHashi(
  sourceChainId: number,
  targetChainId: number,
  params: HashiMessage[],
  emitter: EventEmitter
): Promise<void> {
  const { yaruAddress, targetRPC } = getHashiBridgeConfig(sourceChainId, targetChainId);
  const maxPerTx = 20;
  const targetUrls = Array.isArray(targetRPC) ? targetRPC : [targetRPC];
  const provider = new FallbackRpcProvider(targetUrls, emitter, targetChainId);
  const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
  const yaru = new Contract(yaruAddress, YaruAbi, signer);

  let cursor = 0;

  while (cursor < params.length) {
    const chunk = params.slice(cursor, cursor + maxPerTx);

    const messages = chunk.map((hashiMessage) => {
      const nonce = BigInt(hashiMessage.nonce);
      const targetChainId = BigInt(hashiMessage.targetChainId);
      const threshold = BigInt(hashiMessage.threshold);

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
        nonce,
        targetChainId,
        threshold,
        sender: hashiMessage.sender,
        receiver: hashiMessage.receiver,
        data: dataBytes,
        reporters,
        adapters,
      };
    });
    cursor += chunk.length;
    if (messages.length === 0) {
      continue;
    }

    // Check if the filtered messages are executable before sending the transaction
    const filteredMessages = [];
    for (const message of messages) {
      try {
        await yaru.executeMessages.staticCall([message]);
        filteredMessages.push(message);
      } catch (error) {
        emitter.emit(
          BotEvents.HASHI_MESSAGE_FAILING,
          message.nonce.toString(),
          sourceChainId.toString(),
          targetChainId.toString(),
          error
        );
      }
    }

    if (filteredMessages.length === 0) {
      continue;
    }
    // Throw on send/confirmation failure so the caller does not checkpoint past unexecuted messages
    try {
      const tx = await yaru.executeMessages(filteredMessages);
      const receipt = await tx.wait(1, TX_CONFIRM_TIMEOUT_MS);
      emitter.emit(BotEvents.HASHI_BATCH_TXN, receipt.hash, filteredMessages.length);
    } catch (error) {
      emitter.emit(BotEvents.HASHI_BATCH_FAILED, sourceChainId, targetChainId, filteredMessages.length, error);
      throw new ExecutionError("executeMessages batch (hashi)", targetChainId, "hashi", { cause: error });
    }
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
 * @param chainId The chain ID
 * @param nonce The message nonce
 * @param inboxAddress The Vea Inbox address
 * @param rpcInbox The RPC URL for the inbox network
 * @returns The HashiMessageState if executable, otherwise null
 */
async function toExecuteMessage({
  sourceChainId,
  hashiMessage,
  emitter,
  hasThresholdMet = getMessageStatus,
}: ToExecuteMessageInterface): Promise<HashiMessageState | null> {
  const msgStatus = await hasThresholdMet(sourceChainId, hashiMessage, emitter);
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

/** * Get the message status for threshold and execution on Hashi.
 * @param message The HashiMessage to check
 * @returns The HashiExecutionStatus indicating if the message is executable or already executed
 */
async function getMessageStatus(
  sourceChainId: number,
  message: HashiMessage,
  emitter: EventEmitter
): Promise<HashiExecutionStatus> {
  const bridgeConfig = getHashiBridgeConfig(sourceChainId, message.targetChainId);
  const hashiAddress = bridgeConfig.hashiAddress;
  const yaruAddress = bridgeConfig.yaruAddress;
  const targetUrls = Array.isArray(bridgeConfig.targetRPC) ? bridgeConfig.targetRPC : [bridgeConfig.targetRPC];
  const provider = new FallbackRpcProvider(targetUrls, emitter, message.targetChainId);

  // Check if msg is already executed
  const ifaceYaru = new Interface(YaruAbi);
  const domain = BigInt(sourceChainId); // uint256
  const id = getHashiMsgId(sourceChainId, bridgeConfig.yahoAddress!, message); // bytes32
  const threshold = BigInt(message.threshold); // uint256
  const adapters = message.adapters.map((address) => getAddress(address)); // address[]
  const iface = new Interface(thresholdViewAbi);
  const data = iface.encodeFunctionData("checkHashWithThresholdFromAdapters", [
    domain,
    id,
    BigInt(threshold),
    adapters,
  ]);
  const ret = await provider.call({ to: hashiAddress, data });
  const [ok] = iface.decodeFunctionResult("checkHashWithThresholdFromAdapters", ret);
  if (ok) {
    const executionData = ifaceYaru.encodeFunctionData("executed", [id]);
    const ret = await provider.call({ to: yaruAddress, data: executionData });
    const [flag] = ifaceYaru.decodeFunctionResult("executed", ret);
    if (flag) return HashiExecutionStatus.EXECUTED; // already executed
  }
  return ok ? HashiExecutionStatus.EXECUTABLE : HashiExecutionStatus.THRESHOLD_NOT_MET;
}

/**
 * Get all MessageDispatched logs from Yaho contract starting from a specific block
 * @param chainId The chain ID of the Yaho (source) chain
 * @param targetChainId The chain ID the messages are destined for; other routes' messages are excluded
 * @param providerRPC The RPC URL(s) for the source network
 * @param yahoAddress The Yaho contract address
 * @param fromBlock The starting block number to fetch logs from
 * @param chunkSize The number of blocks to fetch in each chunk (default: 10,000)
 * @param cooldownMs The cooldown time in milliseconds between chunk fetches (default: 1000ms)
 * @returns An array of HashiMessageExecutionVars containing the logs and message details
 */
async function getAllMessageDispatchedLogs(
  chainId: number,
  targetChainId: number,
  providerRPC: string[] | string,
  yahoAddress: string,
  fromBlock: number,
  emitter: EventEmitter,
  chunkSize = 10_000, // RPC’s max range
  cooldownMs = 1000
): Promise<DispatchedTxnData> {
  const rpcOutboxUrls = Array.isArray(providerRPC) ? providerRPC : [providerRPC];
  const provider = new FallbackRpcProvider(rpcOutboxUrls, emitter, chainId);
  let latestFinalized = await provider.getBlock("finalized");
  let toBlock = latestFinalized!.number;
  if (toBlock - fromBlock > MAX_BLOCKS_CYCLE) {
    toBlock = fromBlock + MAX_BLOCKS_CYCLE;
  }
  emitter.emit(BotEvents.INDEXING, fromBlock, toBlock);
  const iface = new Interface(messageDispatchedAbi);
  const topic0 = iface.getEvent("MessageDispatched").topicHash;

  const all: HashiMessageExecutionVars[] = [];

  let start = fromBlock;
  while (start <= toBlock && all.length < MAX_BATCH_SIZE) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    const filter = {
      address: yahoAddress,
      fromBlock: start,
      toBlock: end,
      topics: [topic0],
    };

    const logs = await provider.getLogs(filter);
    for (const log of logs) {
      if (log.address.toLowerCase() == yahoAddress.toLocaleLowerCase()) {
        const parsed = iface.parseLog(log);
        const { messageId, message } = parsed.args as any;
        if (Number(message.targetChainId) !== targetChainId) {
          continue;
        }
        const block = await provider.getBlock(log.blockNumber);
        all.push({
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          messageId,
          message,
          timestamp: block.timestamp,
        });
      }
    }
    if (end < toBlock && cooldownMs > 0) {
      await sleep(cooldownMs);
    }
    start = end + 1;
  }

  all.sort((a, b) => a.blockNumber - b.blockNumber);
  return { txns: all, toBlock };
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

export { executeBatchOnHashi, runHashiExecutor, toExecuteMessage, getDispatchedTxns };
