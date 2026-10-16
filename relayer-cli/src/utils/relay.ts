require("dotenv").config();
import { EventEmitter } from "node:events";
import { getCount, getNonceFrom } from "./graphQueries";
import { getProofAtCount, getMessageDataToRelay } from "./proof";
import { getVeaOutbox, getBatcher } from "./ethers";
import { getBridgeConfig, Network } from "../consts/bridgeRoutes";
import { BotEvents } from "./botEvents";
import { MissingEnvironmentVariable, InvalidChainId, DataError, ExecutionError } from "./errors";
import { FallbackRpcProvider } from "./fallbackProvider";
import { decideStaticCallFailure, StaticCallFailureAction } from "./veaRelayHelpers/staticCallFailure";

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
 * Send a batch through the TransactionBatcher and wait for it to be mined; an empty batch is not sent
 */
const sendBatch = async (run: RelayRun, batch: Batch) => {
  if (batch.nonces.length === 0) return;
  const targets = batch.datas.map(() => run.veaOutboxAddress);
  const values = batch.datas.map(() => 0);
  const gasLimit = await run.batcher.batchSend.estimateGas(targets, values, batch.datas);
  const tx = await run.batcher.batchSend(targets, values, batch.datas, { gasLimit });
  const receipt = await tx.wait(1, TX_CONFIRM_TIMEOUT_MS);
  run.onBatchSent(batch.nonces[batch.nonces.length - 1] + 1, receipt?.hash);
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
        await sendBatch(run, batch);
        batch = { nonces: [], datas: [] };
      }
    } else if (check.action === "stop") {
      await sendBatch(run, batch);
      return nonce;
    } else if (check.action === "drop") {
      return batch.nonces[0] ?? nonce;
    }
  }
  await sendBatch(run, batch);
  return next;
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

export { relayAllFrom, relay, relayBatch, RelayBatchDeps, RelayAllFromDeps, RelayDeps, TX_CONFIRM_TIMEOUT_MS };
