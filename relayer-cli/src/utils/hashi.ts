import { EventEmitter } from "node:events";
import { JsonRpcProvider, Interface, getAddress, Contract, Wallet, isHexString, getBytes } from "ethers";
import { getVeaInbox } from "./ethers";
import { getBridgeConfig } from "../consts/bridgeRoutes";
import { getHashiMsgId } from "./hashiHelpers/hashiMsgUtils";
import { messageDispatchedAbi, thresholdViewAbi, YaruAbi } from "./hashiHelpers/abi";
import { BotEvents } from "./botEvents";
import {
  HashiExecutionStatus,
  HashiMessage,
  HashiMessageState,
  HashiMessageExecutionVars,
} from "./hashiHelpers/hashiTypes";
import { getHashiBridgeConfig } from "./hashiHelpers/bridgeRoutes";

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

interface HashiExecutorInterface {
  sourceChainId: number;
  targetChainId: number;
  network: string;
  blockNumber: number;
  emitter: EventEmitter;
  fetchBridgeConfig?: typeof getHashiBridgeConfig;
  fetchVeaInbox?: typeof getVeaInbox;
  isMessageExecutable?: typeof toExecuteMessage;
  executeMsgsOnHashi?: typeof executeBatchOnHashi;
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
  blockNumber,
  emitter,
  fetchBridgeConfig = getHashiBridgeConfig,
  isMessageExecutable = toExecuteMessage,
  executeMsgsOnHashi = executeBatchOnHashi,
}: HashiExecutorInterface): Promise<number> {
  const bridgeConfig = fetchBridgeConfig(sourceChainId, targetChainId);
  const { yaruAddress, yahoAddress, hashiAddress, sourceRPC } = bridgeConfig;
  const legacyBlockNumber = blockNumber;
  if (!yaruAddress || !yahoAddress || !hashiAddress) {
    emitter.emit(BotEvents.HASHI_NOT_CONFIGURED, targetChainId);
    return 0;
  }
  const executableMessages: HashiMessageState[] = [];

  let endBlock = await new JsonRpcProvider(sourceRPC).getBlockNumber();
  const txs = await getAllMessageDispatchedLogs(sourceRPC, yahoAddress, legacyBlockNumber, endBlock);
  for (const tx of txs) {
    const messageState = await isMessageExecutable({ sourceChainId, hashiMessage: tx.message });
    console.log(`Checked message nonce ${tx.message.nonce} from block ${tx.blockNumber}:`, messageState);
    if (messageState != null && !messageState.executed) {
      executableMessages.push(messageState);
    }
  }
  if (executableMessages.length === 0) {
    return legacyBlockNumber;
  }
  emitter.emit(
    BotEvents.EXECUTING_HASHI,
    executableMessages[0].hashiMessage.nonce,
    executableMessages[executableMessages.length - 1].hashiMessage.nonce
  );
  await executeMsgsOnHashi(sourceChainId, targetChainId, executableMessages);
  emitter.emit(BotEvents.HASHI_EXECUTED, endBlock);
  console.log(`Hashi executor processed up to block ${endBlock}`);
  return endBlock;
}

/** * Execute a batch of messages on Hashi (Yaru contract)
 * @param chainId The chain ID
 * @param params The array of HashiMessageState to execute
 * @returns The last nonce processed + 1
 */
async function executeBatchOnHashi(
  sourceChainId: number,
  targetChainId: number,
  params: HashiMessageState[]
): Promise<void> {
  const { yaruAddress, targetRPC } = getHashiBridgeConfig(sourceChainId, targetChainId);
  const maxPerTx = 20;
  const provider = new JsonRpcProvider(targetRPC);
  const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
  const yaru = new Contract(yaruAddress, YaruAbi, signer);

  let cursor = 0;

  while (cursor < params.length) {
    const chunk = params.slice(cursor, cursor + maxPerTx);

    const messages = chunk
      .filter(({ executed }) => !executed) // only include unexecuted messages
      .map(({ hashiMessage }) => {
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

    if (messages.length === 0) {
      cursor += chunk.length;
      continue;
    }

    const tx = await yaru.executeMessages(messages);
    const receipt = await tx.wait();

    cursor += chunk.length;
  }
}

interface ToExecuteMessageInterface {
  sourceChainId: number;
  hashiMessage: HashiMessage;
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
  hasThresholdMet = getMessageStatus,
}: ToExecuteMessageInterface): Promise<HashiMessageState | null> {
  let executeNonce: HashiMessageState | null = null;
  const msgStatus = await hasThresholdMet(sourceChainId, hashiMessage);
  if (msgStatus === HashiExecutionStatus.EXECUTABLE) {
    executeNonce = { hashiMessage, executed: false };
  } else if (msgStatus === HashiExecutionStatus.EXECUTED) {
    executeNonce = { hashiMessage, executed: true };
  }
  return executeNonce;
}

/** * Get the message status for threshold and execution on Hashi.
 * @param message The HashiMessage to check
 * @returns The HashiExecutionStatus indicating if the message is executable or already executed
 */
async function getMessageStatus(sourceChainId: number, message: HashiMessage): Promise<HashiExecutionStatus> {
  const bridgeConfig = getHashiBridgeConfig(sourceChainId, message.targetChainId);
  const hashiAddress = bridgeConfig.hashiAddress;
  const yaruAddress = bridgeConfig.yaruAddress;
  const provider = new JsonRpcProvider(bridgeConfig.targetRPC);

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

async function getAllMessageDispatchedLogs(
  rpcUrl: string,
  yahoAddress: string,
  fromBlock: number,
  toBlock: number,
  chunkSize = 10_000, // respect RPC’s max range
  cooldownMs = 1000
): Promise<HashiMessageExecutionVars[]> {
  const provider = new JsonRpcProvider(rpcUrl);
  const iface = new Interface(messageDispatchedAbi);
  const topic0 = iface.getEvent("MessageDispatched").topicHash;

  const all: HashiMessageExecutionVars[] = [];

  let start = fromBlock;
  while (start <= toBlock) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    console.log("Searching from", start, end);
    const filter = {
      address: yahoAddress,
      fromBlock: start,
      toBlock: end,
      topics: [topic0],
    };

    const logs = await provider.getLogs(filter);
    for (const log of logs) {
      if (log.address.toLowerCase() == yahoAddress.toLocaleLowerCase()) {
        console.log("Found log in tx:", log.transactionHash, "block:", log.blockNumber);
        const parsed = iface.parseLog(log);
        const { messageId, message } = parsed.args as any;
        all.push({
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          messageId,
          message,
        });
      }
    }
    if (end < toBlock && cooldownMs > 0) {
      await sleep(cooldownMs);
    }
    start = end + 1;
  }

  // Optional: sort by block / nonce
  all.sort((a, b) => a.blockNumber - b.blockNumber);
  return all;
}

export { executeBatchOnHashi, runHashiExecutor, toExecuteMessage };
