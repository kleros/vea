require("dotenv").config();
import { EventEmitter } from "node:events";
import { isError } from "ethers";
import { getCount, getNonceFrom } from "./graphQueries";
import { getProofAtCount, getMessageDataToRelay } from "./proof";
import { getVeaOutbox, getBatcher } from "./ethers";
import { getBridgeConfig, Network } from "../consts/bridgeRoutes";
import { BotEvents } from "./botEvents";
import { MissingEnvironmentVariable, InvalidChainId, DataError, ExecutionError } from "./errors";
import { FallbackRpcProvider } from "./fallbackProvider";
import { decideStaticCallFailure, StaticCallFailureAction } from "./veaRelayHelpers/staticCallFailure";
import { classifyCallFailure, isMessageSpecific } from "./revertClassifier";

// A transaction not mined within this time fails the run, so the route retries next cycle instead of freezing the bot
const TX_CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;

interface RelayDeps {
  fetchVeaOutbox?: typeof getVeaOutbox;
  fetchCount?: typeof getCount;
  fetchBridgeConfig?: typeof getBridgeConfig;
  fetchProofAtCount?: typeof getProofAtCount;
  fetchMessageDataToRelay?: typeof getMessageDataToRelay;
}

/**
 * Relay a message from the veaOutbox
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the message
 * @param network The network to relay messages on
 * @returns The transaction receipt
 */
const relay = async (
  chainId: number,
  nonce: number,
  network: Network,
  emitter: EventEmitter,
  {
    fetchBridgeConfig = getBridgeConfig,
    fetchVeaOutbox = getVeaOutbox,
    fetchCount = getCount,
    fetchProofAtCount = getProofAtCount,
    fetchMessageDataToRelay = getMessageDataToRelay,
  }: RelayDeps = {}
) => {
  try {
    const bridgeConfig = fetchBridgeConfig(chainId);
    const privateKey = process.env.PRIVATE_KEY;
    if (!bridgeConfig) throw new InvalidChainId(chainId);
    if (!privateKey) throw new MissingEnvironmentVariable("PRIVATE_KEY");
    const { veaContracts, rpcOutbox } = bridgeConfig;
    const veaInboxAddress = veaContracts[network].veaInbox.address;
    const veaOutboxAddress = veaContracts[network].veaOutbox.address;
    const rpcOutboxUrls = Array.isArray(rpcOutbox) ? rpcOutbox : [rpcOutbox];
    const veaOutboxProvider = new FallbackRpcProvider(rpcOutboxUrls, emitter, chainId);
    const veaOutbox = fetchVeaOutbox(veaOutboxAddress, privateKey, veaOutboxProvider, chainId, network);
    const count = await fetchCount(veaOutbox, chainId, network);

    const [proof, messageData] = await Promise.all([
      fetchProofAtCount(chainId, nonce, count, veaInboxAddress, network),
      fetchMessageDataToRelay(chainId, veaInboxAddress, nonce, network),
    ]);

    const [to, from, data] = messageData;
    const txn = await veaOutbox.sendMessage(proof, nonce, to, from, data);
    const receipt = await txn.wait(1, TX_CONFIRM_TIMEOUT_MS);
    return receipt;
  } catch (error) {
    throw new ExecutionError("relay", chainId, network, { cause: error });
  }
};

interface BatchDeps extends RelayDeps {
  fetchBatcher?: typeof getBatcher;
}

interface RelayBatchDeps extends BatchDeps {
  targetChainId: number;
  network: Network;
  nonce: number;
  maxBatchSize: number;
  emitter: EventEmitter;
}

interface RelayAllFromDeps extends BatchDeps {
  fetchNonceFrom?: typeof getNonceFrom;
}

// The contracts, the outbox count and the callbacks one relayBatch or relayAllFrom call works with
interface RelayRun {
  chainId: number;
  network: Network;
  count: number;
  maxBatchSize: number;
  veaInboxAddress: string;
  veaOutboxAddress: string;
  veaOutbox: ReturnType<typeof getVeaOutbox>;
  batcher: ReturnType<typeof getBatcher>;
  emitter: EventEmitter;
  readCount: () => Promise<number>;
  fetchProofAtCount: typeof getProofAtCount;
  fetchMessageDataToRelay: typeof getMessageDataToRelay;
  onBatchSent: (nextNonce: number, txHash?: string) => void;
}

interface Batch {
  nonces: number[];
  datas: string[];
}

type MessageCheck = { action: "include"; callData: string } | { action: StaticCallFailureAction };

/**
 * Connect to the outbox and the batcher of a route and read the outbox count
 * @param onBatchSent Called after each mined batch with the nonce after its last message and the transaction hash
 */
const openRelayRun = async (
  chainId: number,
  network: Network,
  maxBatchSize: number,
  emitter: EventEmitter,
  {
    fetchBridgeConfig = getBridgeConfig,
    fetchCount = getCount,
    fetchVeaOutbox = getVeaOutbox,
    fetchProofAtCount = getProofAtCount,
    fetchMessageDataToRelay = getMessageDataToRelay,
    fetchBatcher = getBatcher,
  }: BatchDeps,
  onBatchSent: RelayRun["onBatchSent"]
): Promise<RelayRun> => {
  const bridgeConfig = fetchBridgeConfig(chainId);
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new MissingEnvironmentVariable("PRIVATE_KEY");
  const { batcherAddress, veaContracts, rpcOutbox } = bridgeConfig;
  const veaInboxAddress = veaContracts[network].veaInbox.address;
  const veaOutboxAddress = veaContracts[network].veaOutbox.address;
  const rpcOutboxUrls = Array.isArray(rpcOutbox) ? rpcOutbox : [rpcOutbox];
  const veaOutboxProvider = new FallbackRpcProvider(rpcOutboxUrls, emitter, chainId);
  const batcher = fetchBatcher(batcherAddress, privateKey, veaOutboxProvider);
  const veaOutbox = fetchVeaOutbox(veaOutboxAddress, privateKey, veaOutboxProvider, chainId, network);
  const readCount = () => fetchCount(veaOutbox, chainId, network);
  const count = await readCount();
  return {
    chainId,
    network,
    count,
    maxBatchSize,
    veaInboxAddress,
    veaOutboxAddress,
    veaOutbox,
    batcher,
    emitter,
    readCount,
    fetchProofAtCount,
    fetchMessageDataToRelay,
    onBatchSent,
  };
};

/**
 * Build a message's sendMessage call and check it with a staticCall against the run's count
 * @returns The call data to batch, or what to do with the message when the staticCall fails
 */
const checkMessage = async (run: RelayRun, nonce: number): Promise<MessageCheck> => {
  const [proof, messageData] = await Promise.all([
    run.fetchProofAtCount(run.chainId, nonce, run.count, run.veaInboxAddress, run.network),
    run.fetchMessageDataToRelay(run.chainId, run.veaInboxAddress, nonce, run.network),
  ]);
  const [to, from, data] = messageData;
  try {
    await run.veaOutbox.sendMessage.staticCall(proof, nonce, to, from, data);
  } catch (err) {
    run.emitter.emit(BotEvents.MESSAGE_EXECUTION_FAILED, run.chainId, run.network, nonce, err);
    return { action: await decideStaticCallFailure(err, run.count, run.readCount) };
  }
  const callData = run.veaOutbox.interface.encodeFunctionData("sendMessage", [proof, nonce, to, from, data]);
  return { action: "include", callData };
};

/**
 * Whether the error is this transaction mined and reverted: a CALL_EXCEPTION carrying its status-0 receipt. A
 * TRANSACTION_REPLACED also carries a receipt, of another transaction, so it is not one.
 */
const isMinedRevert = (error: unknown): boolean =>
  isError(error, "CALL_EXCEPTION") && (error as { receipt?: { status?: unknown } }).receipt?.status === 0;

/** A failed send: its error, and whether the transaction was broadcast before it failed */
type SendOutcome = { error: unknown; broadcast: boolean } | null;

/**
 * Send the calls through the TransactionBatcher and wait for the transaction to be mined
 * @returns null once mined, else the error and whether it came after the broadcast (the confirmation) or before it
 *   (gas estimation or the broadcast itself)
 */
const sendCalls = async (run: RelayRun, nonces: number[], datas: string[]): Promise<SendOutcome> => {
  const targets = datas.map(() => run.veaOutboxAddress);
  const values = datas.map(() => 0);
  let tx: Awaited<ReturnType<RelayRun["batcher"]["batchSend"]>>;
  try {
    const gasLimit = await run.batcher.batchSend.estimateGas(targets, values, datas);
    tx = await run.batcher.batchSend(targets, values, datas, { gasLimit });
  } catch (error) {
    return { error, broadcast: false };
  }
  let receipt: Awaited<ReturnType<typeof tx.wait>>;
  try {
    receipt = await tx.wait(1, TX_CONFIRM_TIMEOUT_MS);
  } catch (error) {
    return { error, broadcast: true };
  }
  run.onBatchSent(nonces[nonces.length - 1] + 1, receipt?.hash);
  return null;
};

/**
 * Decide what to do with a message that failed when sent alone (or as the only message of a batch).
 * A revert or a VM abort at gas estimation follows the staticCall rules. A mined revert follows them too: it is skipped
 * for good, since retrying would pay for a reverted transaction every cycle, unless the outbox count changed, which
 * made its proof stale. Any other failure (transport, unknown, wait timeout) is rethrown.
 * @returns The nonce to resume from, or undefined when the message is skipped
 */
const settleFailedMessage = async (run: RelayRun, nonce: number, error: unknown): Promise<number | undefined> => {
  if (!isMinedRevert(error) && !isMessageSpecific(classifyCallFailure(error))) throw error;
  run.emitter.emit(BotEvents.MESSAGE_EXECUTION_FAILED, run.chainId, run.network, nonce, error);
  if (isMinedRevert(error)) {
    return (await run.readCount()) === run.count ? undefined : nonce;
  }
  const action = await decideStaticCallFailure(error, run.count, run.readCount);
  return action === "skip" ? undefined : nonce;
};

/**
 * Send a batch through the TransactionBatcher and wait for it to be mined; an empty batch is not sent.
 * Messages that each pass their staticCall can still fail together: the batcher reverts if any call does, and a batch
 * can exceed a gas or size limit that no message alone does. So when the batch fails before its broadcast (whatever the
 * error), or is mined and reverts, it is sent again one message at a time, in nonce order, and a message that fails
 * alone is handled by settleFailedMessage. A batch broadcast that fails otherwise (a confirmation timeout) is rethrown.
 * @returns The nonce to resume from when a message stopped the run early, undefined when every message was relayed or skipped
 */
const sendBatch = async (run: RelayRun, batch: Batch): Promise<number | undefined> => {
  if (batch.nonces.length === 0) return undefined;
  const failed = await sendCalls(run, batch.nonces, batch.datas);
  if (failed === null) return undefined;
  if (batch.nonces.length === 1) return settleFailedMessage(run, batch.nonces[0], failed.error);
  // Once broadcast, only a mined revert is resent message by message; a pending batch plus its singles would pay twice
  if (failed.broadcast && !isMinedRevert(failed.error)) throw failed.error;
  for (const [i, nonce] of batch.nonces.entries()) {
    const single = await sendCalls(run, [nonce], [batch.datas[i]]);
    if (single === null) continue;
    const resume = await settleFailedMessage(run, nonce, single.error);
    if (resume !== undefined) return resume;
  }
  return undefined;
};

/**
 * Yield the nonces from `from` up to, not including, `to`, one at a time, so a long backlog is never held in memory
 */
function* nonceRange(from: number, to: number): Generator<number> {
  for (let x = from; x < to; x++) yield x;
}

/**
 * Relay the candidate nonces in batches of at most maxBatchSize messages, checking each message with a staticCall.
 * A message is handled once it is relayed in a mined batch, was already relayed, or is skipped as permanent.
 * A batch that reverts is sent again message by message, so one conflicting message cannot halt the route.
 * @param candidates The nonces to relay, ascending, each at or above fromNonce and below the run's count; read one at a time
 * @param fromNonce The nonce the caller started from
 * @returns The nonce to resume from: the first candidate not handled, else the last candidate + 1, else fromNonce
 */
const relayCandidates = async (run: RelayRun, candidates: Iterable<number>, fromNonce: number): Promise<number> => {
  let batch: Batch = { nonces: [], datas: [] };
  let next = fromNonce;
  for (const nonce of candidates) {
    // A stop or a drop returns before the next candidate, so `next` only counts the candidates handled
    next = nonce + 1;
    if (await run.veaOutbox.isMsgRelayed(nonce)) continue;
    const check = await checkMessage(run, nonce);
    if (check.action === "include") {
      batch.nonces.push(nonce);
      batch.datas.push(check.callData);
      if (batch.nonces.length >= run.maxBatchSize) {
        const resume = await sendBatch(run, batch);
        if (resume !== undefined) return resume;
        batch = { nonces: [], datas: [] };
      }
    } else if (check.action === "stop") {
      return (await sendBatch(run, batch)) ?? nonce;
    } else if (check.action === "drop") {
      return batch.nonces[0] ?? nonce;
    }
  }
  return (await sendBatch(run, batch)) ?? next;
};

/**
 * Relay a batch of messages from the veaOutbox
 * @param targetChainId The chain id of the veaOutbox chain
 * @param network The network to relay messages on
 * @param nonce The nonce of the message
 * @param maxBatchSize The maximum number of messages to relay in a single batch
 *
 * @returns The nonce to relay from next time; every message below it is relayed or skipped as permanent
 */
const relayBatch = async ({
  targetChainId: chainId,
  network,
  nonce,
  maxBatchSize,
  emitter,
  ...deps
}: RelayBatchDeps): Promise<number> => {
  try {
    const run = await openRelayRun(chainId, network, maxBatchSize, emitter, deps, (nextNonce, txHash) =>
      emitter.emit(BotEvents.RELAY_BATCH, nextNonce, txHash)
    );
    return await relayCandidates(run, nonceRange(nonce, run.count), nonce);
  } catch (error) {
    throw new ExecutionError("relayBatch", chainId, network, { cause: error });
  }
};

/**
 * Get the nonces of the senders' messages that the outbox snapshot covers, from nonce on, ascending and without duplicates
 */
const getCandidates = async (
  run: RelayRun,
  nonce: number,
  msgSenders: string[],
  fetchNonceFrom: typeof getNonceFrom
): Promise<number[]> => {
  const candidates = new Set<number>();
  for (const msgSender of msgSenders) {
    const nonces = await fetchNonceFrom(run.chainId, run.veaInboxAddress, nonce, msgSender, run.network);
    // A nonce at or above count is not in the snapshot yet: it has no proof
    nonces.filter((x) => x >= nonce && x < run.count).forEach((x) => candidates.add(x));
  }
  return [...candidates].sort((a, b) => a - b);
};

/**
 * Relay all messages from the veaOutbox for the given senders
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the first message to relay
 * @param msgSenders The addresses of the senders
 * @param maxBatchSize The maximum number of messages to relay in a single batch
 * @returns The nonce to relay from next time (never null); every sender's message below it is handled
 */
const relayAllFrom = async (
  chainId: number,
  network: Network,
  nonce: number,
  msgSenders: string[],
  emitter: EventEmitter,
  maxBatchSize: number = 10,
  { fetchNonceFrom = getNonceFrom, ...deps }: RelayAllFromDeps = {}
): Promise<number> => {
  try {
    const run = await openRelayRun(chainId, network, maxBatchSize, emitter, deps, (nextNonce, txHash) =>
      emitter.emit(BotEvents.RELAY_ALL_FROM, nextNonce, msgSenders, txHash)
    );
    if (!run.count) return nonce;
    const candidates = await getCandidates(run, nonce, msgSenders, fetchNonceFrom);
    return await relayCandidates(run, candidates, nonce);
  } catch (error) {
    throw new ExecutionError("relayAllFrom", chainId, network, { cause: error });
  }
};

export { relayAllFrom, relay, relayBatch, RelayBatchDeps, RelayAllFromDeps, RelayDeps };
