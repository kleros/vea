require("dotenv").config();
import { EventEmitter } from "node:events";
import { getCount, getNonceFrom } from "./graphQueries";
import { getProofAtCount, getMessageDataToRelay } from "./proof";
import { getVeaOutbox, getBatcher } from "./ethers";
import { getBridgeConfig, Network } from "../consts/bridgeRoutes";
import { BotEvents } from "./botEvents";
import { MissingEnvironmentVariable, InvalidChainId, DataError, ExecutionError } from "./errors";
import { FallbackRpcProvider } from "./fallbackProvider";

/**
 * Relay a message from the veaOutbox
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the message
 * @param network The network to relay messages on
 * @returns The transaction receipt
 */
const relay = async (chainId: number, nonce: number, network: Network, emitter: EventEmitter) => {
  try {
    const bridgeConfig = getBridgeConfig(chainId);
    const privateKey = process.env.PRIVATE_KEY;
    if (!bridgeConfig) throw new InvalidChainId(chainId);
    if (!privateKey) throw new MissingEnvironmentVariable("PRIVATE_KEY");
    const { veaContracts, rpcOutbox } = bridgeConfig;
    const veaInboxAddress = veaContracts[network].veaInbox.address;
    const veaOutboxAddress = veaContracts[network].veaOutbox.address;
    const rpcOutboxUrls = Array.isArray(rpcOutbox) ? rpcOutbox : [rpcOutbox];
    const veaOutboxProvider = new FallbackRpcProvider(rpcOutboxUrls, emitter, chainId);
    const veaOutbox = getVeaOutbox(veaOutboxAddress, privateKey, veaOutboxProvider, chainId, network);
    const count = await getCount(veaOutbox, chainId, network);

    const [proof, messageData] = await Promise.all([
      getProofAtCount(chainId, nonce, count, veaInboxAddress, network),
      getMessageDataToRelay(chainId, veaInboxAddress, nonce, network),
    ]);

    const [to, from, data] = messageData;
    const txn = await veaOutbox.sendMessage(proof, nonce, to, from, data);
    const receipt = await txn.wait();
    return receipt;
  } catch (error) {
    throw new ExecutionError("relay", chainId, network, { cause: error });
  }
};

interface RelayBatchDeps {
  chainId: number;
  network: Network;
  nonce: number;
  maxBatchSize: number;
  emitter: EventEmitter;
  fetchVeaOutbox?: typeof getVeaOutbox;
  fetchCount?: typeof getCount;
  fetchBridgeConfig?: typeof getBridgeConfig;
  fetchProofAtCount?: typeof getProofAtCount;
  fetchMessageDataToRelay?: typeof getMessageDataToRelay;
  fetchBatcher?: typeof getBatcher;
}

/**
 * Relay a batch of messages from the veaOutbox
 * @param chainId The chain id of the veaOutbox chain
 * @param network The network to relay messages on
 * @param nonce The nonce of the message
 * @param maxBatchSize The maximum number of messages to relay in a single batch
 *
 * @returns The nonce of the last message relayed
 */
const relayBatch = async ({
  chainId,
  network,
  nonce,
  maxBatchSize,
  emitter,
  fetchBridgeConfig = getBridgeConfig,
  fetchCount = getCount,
  fetchVeaOutbox = getVeaOutbox,
  fetchProofAtCount = getProofAtCount,
  fetchMessageDataToRelay = getMessageDataToRelay,
  fetchBatcher = getBatcher,
}: RelayBatchDeps) => {
  try {
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
    const count = await fetchCount(veaOutbox, chainId, network);

    while (nonce < count) {
      let batchMessages = 0;
      let targets: string[] = [];
      let values: number[] = [];
      let datas: string[] = [];

      while (batchMessages < maxBatchSize && nonce < count) {
        const isMsgRelayed = await veaOutbox.isMsgRelayed(nonce);
        if (isMsgRelayed) {
          nonce++;
          continue;
        }
        const [proof, messageData] = await Promise.all([
          fetchProofAtCount(chainId, nonce, count, veaInboxAddress, network),
          fetchMessageDataToRelay(chainId, veaInboxAddress, nonce, network),
        ]);
        const [to, from, data] = messageData;
        try {
          await veaOutbox.sendMessage.staticCall(proof, nonce, to, from, data);
          const callData = veaOutbox.interface.encodeFunctionData("sendMessage", [proof, nonce, to, from, data]);
          datas.push(callData);
          targets.push(veaOutboxAddress);
          values.push(0);
          batchMessages += 1;
          nonce++;
        } catch (err) {
          emitter.emit(BotEvents.MESSAGE_EXECUTION_FAILED, chainId, network, nonce, err);
          nonce++;
        }
      }
      if (batchMessages > 0) {
        const gasLimit = await batcher.batchSend.estimateGas(targets, values, datas);
        const tx = await batcher.batchSend(targets, values, datas, { gasLimit });
        const receipt = await tx.wait();
        emitter.emit(BotEvents.RELAY_BATCH, nonce, receipt?.hash);
      }
    }
    return nonce;
  } catch (error) {
    throw new ExecutionError("relayBatch", chainId, network, { cause: error });
  }
};

/**
 * Relay all messages from the veaOutbox for a given sender
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the first message to relay
 * @param msgSender The address of the sender
 * @returns The nonce of the last message relayed
 */
const relayAllFrom = async (
  chainId: number,
  network: Network,
  nonce: number,
  msgSenders: string[],
  emitter: EventEmitter
): Promise<number | null> => {
  try {
    const bridgeConfig = getBridgeConfig(chainId);
    const { veaContracts, batcherAddress, rpcOutbox } = bridgeConfig;
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new MissingEnvironmentVariable("PRIVATE_KEY");
    const veaInboxAddress = veaContracts[network].veaInbox.address;
    const veaOutboxAddress = veaContracts[network].veaOutbox.address;
    const rpcOutboxUrls = Array.isArray(rpcOutbox) ? rpcOutbox : [rpcOutbox];
    const veaOutboxProvider = new FallbackRpcProvider(rpcOutboxUrls, emitter, chainId);
    const veaOutbox = getVeaOutbox(veaOutboxAddress, privateKey, veaOutboxProvider, chainId, network);
    const batcher = getBatcher(batcherAddress, privateKey, veaOutboxProvider);
    const count = await getCount(veaOutbox, chainId, network);
    if (!count) return null;

    let targets: string[] = [];
    let values: number[] = [];
    let datas: string[] = [];
    let lastNonce = null;
    for (const msgSender of msgSenders) {
      const nonces = await getNonceFrom(chainId, veaInboxAddress, nonce, msgSender, network);

      for (const x of nonces) {
        const isMsgRelayed = await veaOutbox.isMsgRelayed(x);
        if (isMsgRelayed) {
          continue;
        }

        const [proof, messageData] = await Promise.all([
          getProofAtCount(chainId, x, count, veaInboxAddress, network),
          getMessageDataToRelay(chainId, veaInboxAddress, x, network),
        ]);
        const [to, from, data] = messageData;

        const callData = veaOutbox.interface.encodeFunctionData("sendMessage", [proof, x, to, from, data]);
        datas.push(callData);
        targets.push(veaContracts[network].veaOutbox.address);
        values.push(0);
        lastNonce = x;
      }
    }

    if (lastNonce != null) {
      const gasLimit = await batcher.batchSend.estimateGas(targets, values, datas);
      const tx = await batcher.batchSend(targets, values, datas, { gasLimit });
      const receipt = await tx.wait();
      emitter.emit(BotEvents.RELAY_ALL_FROM, nonce, msgSenders, receipt?.hash);
      return lastNonce + 1; // return the next nonce to relay
    }

    return lastNonce; // return current nonce
  } catch (error) {
    throw new ExecutionError("relayAllFrom", chainId, network, { cause: error });
  }
};

export { relayAllFrom, relay, relayBatch, RelayBatchDeps };
