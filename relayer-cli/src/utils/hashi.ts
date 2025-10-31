import { EventEmitter } from "node:events";
import { JsonRpcProvider, Interface, getAddress, Contract, Wallet, isHexString, getBytes } from "ethers";
import { getVeaMsgTrnx } from "./graphQueries";
import { getVeaInbox } from "./ethers";
import { getBridgeConfig } from "../consts/bridgeRoutes";
import { getHashiMsgId } from "./hashiHelpers/hashiMsgUtils";
import { messageDispatchedAbi, thresholdViewAbi, YaruAbi } from "./hashiHelpers/abi";
import { BotEvents } from "./botEvents";
import { HashiExecutionStatus, HashiMessage, VeaNonceToHashiMessage } from "./hashiHelpers/hashiTypes";

const SOURCE_CHAIN_ID = 421614; // Arbitrum Sepolia

interface HashiExecutorInterface {
  chainId: number;
  network: string;
  nonce: number;
  emitter: EventEmitter;
  fetchBridgeConfig?: typeof getBridgeConfig;
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
  chainId,
  network,
  nonce,
  emitter,
  fetchBridgeConfig = getBridgeConfig,
  fetchVeaInbox = getVeaInbox,
  isMessageExecutable = toExecuteMessage,
  executeMsgsOnHashi = executeBatchOnHashi,
}: HashiExecutorInterface): Promise<number | undefined> {
  const bridgeConfig = fetchBridgeConfig(chainId);
  const { veaContracts, rpcInbox } = bridgeConfig;
  const veaInboxAddress = veaContracts[network].veaInbox.address;
  const privateKey = process.env.PRIVATE_KEY;
  const veaInbox = fetchVeaInbox(veaInboxAddress, privateKey, rpcInbox, chainId);
  const inboxCount = await veaInbox.count();
  const executableNonces: VeaNonceToHashiMessage[] = [];
  const legacyNonce = nonce;
  while (nonce < inboxCount) {
    // ToDo: Add cooldown periods for nonces that cannot be executed.
    const toExecute = await isMessageExecutable({ chainId, nonce, veaInboxAddress, rpcInbox });
    if (toExecute) {
      executableNonces.push(toExecute);
    }
    nonce++;
  }
  if (executableNonces.length === 0) {
    return legacyNonce;
  }
  emitter.emit(
    BotEvents.EXECUTING_HASHI,
    executableNonces[0].nonce,
    executableNonces[executableNonces.length - 1].nonce
  );
  nonce = await executeMsgsOnHashi(chainId, executableNonces);
  emitter.emit(BotEvents.HASHI_EXECUTED, nonce);
  return nonce;
}

/** * Execute a batch of messages on Hashi (Yaru contract)
 * @param chainId The chain ID
 * @param params The array of VeaNonceToHashiMessage to execute
 * @returns The last nonce processed + 1
 */
async function executeBatchOnHashi(chainId: number, params: VeaNonceToHashiMessage[]): Promise<number> {
  const { yaruAddress, rpcOutbox } = getBridgeConfig(chainId);
  const maxPerTx = 20;
  const provider = new JsonRpcProvider(rpcOutbox);
  const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
  const yaru = new Contract(yaruAddress, YaruAbi, signer);

  let cursor = 0;
  let lastNonceProcessed = 0;

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
    lastNonceProcessed = Number(params[Math.min(cursor, params.length) - 1].nonce);
  }

  return ++lastNonceProcessed;
}

interface ToExecuteMessageInterface {
  chainId: number;
  nonce: number;
  veaInboxAddress: string;
  rpcInbox: string;
  fetchVeaMsgTrnx?: typeof getVeaMsgTrnx;
  fetchBridgeConfig?: typeof getBridgeConfig;
  hasThresholdMet?: typeof getMessageStatus;
  provider?: JsonRpcProvider;
  logIFace?: Interface;
}
/**
 * Check if a message is executable on Hashi by verifying if the threshold is met.
 * @param chainId The chain ID
 * @param nonce The message nonce
 * @param inboxAddress The Vea Inbox address
 * @param rpcInbox The RPC URL for the inbox network
 * @returns The VeaNonceToHashiMessage if executable, otherwise null
 */
async function toExecuteMessage({
  chainId,
  nonce,
  veaInboxAddress,
  rpcInbox,
  fetchVeaMsgTrnx = getVeaMsgTrnx,
  fetchBridgeConfig = getBridgeConfig,
  hasThresholdMet = getMessageStatus,
  provider = new JsonRpcProvider(rpcInbox),
  logIFace = new Interface(messageDispatchedAbi),
}: ToExecuteMessageInterface): Promise<VeaNonceToHashiMessage | null> {
  const hashes = await fetchVeaMsgTrnx(nonce, veaInboxAddress);
  const bridgeConfig = fetchBridgeConfig(chainId);
  const yahoAddress = bridgeConfig.yahoAddress?.toLowerCase();
  const receipt = await provider.getTransactionReceipt(hashes[0]);
  let executeNonce: VeaNonceToHashiMessage | null = null;
  let hashiMessage: HashiMessage | null = null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === yahoAddress) {
      const logData = log.data;
      const decodedLog = logIFace.decodeEventLog("MessageDispatched", logData, log.topics);
      const message = decodedLog.message;
      hashiMessage = {
        nonce: message[0],
        targetChainId: message[1],
        threshold: message[2],
        sender: message[3],
        receiver: message[4],
        data: message[5],
        reporters: message[6] as string[],
        adapters: message[7] as string[],
      };
      const msgStatus = await hasThresholdMet(hashiMessage);
      if (msgStatus === HashiExecutionStatus.EXECUTABLE) {
        executeNonce = { nonce, hashiMessage, executed: false };
      } else if (msgStatus === HashiExecutionStatus.EXECUTED) {
        executeNonce = { nonce, hashiMessage, executed: true };
      }
      break;
    }
  }
  return executeNonce;
}

/** * Get the message status for threshold and execution on Hashi.
 * @param message The HashiMessage to check
 * @returns The HashiExecutionStatus indicating if the message is executable or already executed
 */
async function getMessageStatus(message: HashiMessage): Promise<HashiExecutionStatus> {
  const bridgeConfig = getBridgeConfig(message.targetChainId);
  const hashiAddress = bridgeConfig.hashiAddress;
  const yaruAddress = bridgeConfig.yaruAddress;
  const provider = new JsonRpcProvider(bridgeConfig.rpcOutbox);

  // Check if msg is already executed
  const ifaceYaru = new Interface(YaruAbi);
  const domain = BigInt(SOURCE_CHAIN_ID); // uint256
  const id = getHashiMsgId(SOURCE_CHAIN_ID, bridgeConfig.yahoAddress!, message); // bytes32
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

export { executeBatchOnHashi, runHashiExecutor, toExecuteMessage };
