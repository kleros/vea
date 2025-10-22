require("dotenv").config();
import request from "graphql-request";
import { EventEmitter } from "node:events";
import { VeaOutboxArbToEth, VeaOutboxArbToGnosis } from "@kleros/vea-contracts/typechain-types";
import { getProofAtCount, getMessageDataToRelay } from "./proof";
import { getVeaOutbox, getBatcher } from "./ethers";
import { getBridgeConfig, Network } from "../consts/bridgeRoutes";
import { BotEvents } from "./botEvents";
import { MissingEnvironmentVariable, InvalidChainId, DataError } from "./errors";

interface SnapshotResponse {
  snapshotSaveds: Array<{ count: string }>;
}
/**
 * Get the count of the veaOutbox
 * @param veaOutbox The veaOutbox contract instance
 * @param chainId The chain id of the veaOutbox chain
 * @returns The count of the veaOutbox
 */
const getCount = async (veaOutbox: VeaOutboxArbToEth | VeaOutboxArbToGnosis, chainId: number): Promise<number> => {
  const subgraph = process.env.RELAYER_SUBGRAPH;
  const stateRoot = await veaOutbox.stateRoot();

  const result = (await request(
    `https://api.studio.thegraph.com/query/${subgraph}`,
    `{
      snapshotSaveds(first: 1, where: { stateRoot: "${stateRoot}" }) {
        count
      }
    }`
  )) as SnapshotResponse;

  if (result["snapshotSaveds"].length == 0) return 0;

  return Number(result["snapshotSaveds"][0].count);
};

/**
 * Relay a message from the veaOutbox
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the message
 * @param network The network to relay messages on
 * @returns The transaction receipt
 */
const relay = async (chainId: number, nonce: number, network: Network) => {
  const bridgeConfig = getBridgeConfig(chainId);
  const privateKey = process.env.PRIVATE_KEY;
  if (!bridgeConfig) throw new InvalidChainId(chainId);
  if (!privateKey) throw new MissingEnvironmentVariable("PRIVATE_KEY");
  const { veaContracts, rpcOutbox } = bridgeConfig;
  const veaInboxAddress = veaContracts[network].veaInbox.address;
  const veaOutboxAddress = veaContracts[network].veaOutbox.address;

  const veaOutbox = getVeaOutbox(veaOutboxAddress, privateKey, rpcOutbox, chainId, network);
  const count = await getCount(veaOutbox, chainId);

  const [proof, messageData] = await Promise.all([
    getProofAtCount(chainId, nonce, count, veaInboxAddress),
    getMessageDataToRelay(chainId, veaInboxAddress, nonce),
  ]);
  if (!messageData) throw new DataError("relay message data");
  const [to, from, data] = messageData;
  const txn = await veaOutbox.sendMessage(proof, nonce, to, from, data);
  const receipt = await txn.wait();
  return receipt;
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
  const bridgeConfig = fetchBridgeConfig(chainId);
  const privateKey = process.env.PRIVATE_KEY;
  const { batcherAddress, veaContracts, rpcOutbox } = bridgeConfig;
  const veaInboxAddress = veaContracts[network].veaInbox.address;
  const veaOutboxAddress = veaContracts[network].veaOutbox.address;

  const batcher = fetchBatcher(batcherAddress, privateKey, rpcOutbox);
  const veaOutbox = fetchVeaOutbox(veaOutboxAddress, privateKey, rpcOutbox, chainId, network);
  const count = await fetchCount(veaOutbox, chainId);

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
        fetchProofAtCount(chainId, nonce, count, veaInboxAddress),
        fetchMessageDataToRelay(chainId, veaInboxAddress, nonce),
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
      } catch {
        emitter.emit(BotEvents.MESSAGE_EXECUTION_FAILED, nonce);
        nonce++;
      }
    }
    if (batchMessages > 0) {
      const gasLimit = await batcher.batchSend.estimateGas(targets, values, datas);
      const tx = await batcher.batchSend(targets, values, datas, { gasLimit });
      const receipt = await tx.wait();
      emitter.emit(BotEvents.RELAY_BATCH, nonce, receipt.hash);
    }
  }
  return nonce;
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
  const bridgeConfig = getBridgeConfig(chainId);
  const { veaContracts, batcherAddress, rpcOutbox } = bridgeConfig;
  const privateKey = process.env.PRIVATE_KEY;
  const veaInboxAddress = veaContracts[network].veaInbox.address;
  const veaOutboxAddress = veaContracts[network].veaOutbox.address;

  const batcher = getBatcher(batcherAddress, privateKey, rpcOutbox);
  const veaOutbox = getVeaOutbox(veaOutboxAddress, privateKey, rpcOutbox, chainId, network);
  const count = await getCount(veaOutbox, chainId);
  if (!count) return null;

  let targets: string[] = [];
  let values: number[] = [];
  let datas: string[] = [];
  let lastNonce = null;
  for (const msgSender of msgSenders) {
    const nonces = await getNonceFrom(chainId, veaInboxAddress, nonce, msgSender);

    for (const x of nonces) {
      const isMsgRelayed = await veaOutbox.isMsgRelayed(x);
      if (isMsgRelayed) {
        continue;
      }

      const [proof, messageData] = await Promise.all([
        getProofAtCount(chainId, x, count, veaInboxAddress),
        getMessageDataToRelay(chainId, veaInboxAddress, x),
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
    emitter.emit(BotEvents.RELAY_ALL_FROM, nonce, msgSenders, receipt.hash);
  }

  return lastNonce + 1; // return current nonce
};

interface MessageSent {
  nonce: number;
}

interface MessageSentsResponse {
  messageSents: MessageSent[];
}

/**
 * Get the nonces of messages sent by a given sender
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the first message to relay
 * @param msgSender The address of the sender
 * @returns The nonces of the messages sent by the sender
 */
const getNonceFrom = async (chainId: number, inbox: string, nonce: number, msgSender: string) => {
  const subgraph = process.env.RELAYER_SUBGRAPH;

  const result = (await request(
    `https://api.studio.thegraph.com/query/${subgraph}`,
    `{
        messageSents(
          first: 1000, 
          where: {
            inbox: "${inbox}",
            nonce_gte: ${nonce}, 
            msgSender_: {id: "${msgSender}"}
          }, 
          orderBy: nonce, 
          orderDirection: asc
        ) {
          nonce
        }
      }`
  )) as MessageSentsResponse;

  return result[`messageSents`].map((a: { nonce: number }) => a.nonce);
};

export { relayAllFrom, relay, relayBatch, RelayBatchDeps };
