require("dotenv").config();
import request from "graphql-request";
import { VeaOutboxArbToEth, VeaOutboxArbToGnosis } from "@kleros/vea-contracts/typechain-types";
import { getProofAtCount, getMessageDataToRelay } from "./proof";
import { getVeaOutbox, getBatcher } from "./ethers";
import { getBridgeConfig, Networks } from "../consts/bridgeRoutes";

/**
 * Get the count of the veaOutbox
 * @param veaOutbox The veaOutbox contract instance
 * @param chainId The chain id of the veaOutbox chain
 * @returns The count of the veaOutbox
 */
const getCount = async (veaOutbox: VeaOutboxArbToEth | VeaOutboxArbToGnosis, chainId: number): Promise<number> => {
  const subgraph = process.env.RELAYER_SUBRAPGH;
  const stateRoot = await veaOutbox.stateRoot();

  const result = await request(
    `https://api.studio.thegraph.com/query/${subgraph}`,
    `{
      snapshotSaveds(first: 1, where: { stateRoot: "${stateRoot}" }) {
        count
      }
    }`
  );

  if (result["snapshotSaveds"].length == 0) return 0;

  return Number(result["snapshotSaveds"][0].count);
};

/**
 * Relay a message from the veaOutbox
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the message
 * @returns The transaction receipt
 */
const relay = async (chainId: number, nonce: number, network: Networks) => {
  const { veaContracts, rpcOutbox } = getBridgeConfig(chainId);
  const veaOutbox = getVeaOutbox(veaContracts[network].veaOutbox.address, process.env.PRIVATE_KEY, rpcOutbox, chainId);
  const count = await getCount(veaOutbox, chainId);

  const [proof, [to, data]] = await Promise.all([
    getProofAtCount(chainId, nonce, count),
    getMessageDataToRelay(chainId, veaContracts[network].veaInbox.address, nonce),
  ]);

  const txn = await veaOutbox.sendMessage(proof, nonce, to, data);
  const receipt = await txn.wait();
  return receipt;
};

interface RelayBatchDeps {
  chainId: number;
  network: Networks;
  nonce: number;
  maxBatchSize: number;
  fetchVeaOutbox?: typeof getVeaOutbox;
  fetchCount?: typeof getCount;
  fetchBridgeConfig?: typeof getBridgeConfig;
  fetchProofAtCount?: typeof getProofAtCount;
  fetchMessageDataToRelay?: typeof getMessageDataToRelay;
}

interface BatchItem {
  target: string;
  value: number;
  data: string;
}

/**
 * Relay a batch of messages from the veaOutbox
 * @param chainId The chain id of the veaOutbox chain
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
  fetchBridgeConfig = getBridgeConfig,
  fetchCount = getCount,
  fetchVeaOutbox = getVeaOutbox,
  fetchProofAtCount = getProofAtCount,
  fetchMessageDataToRelay = getMessageDataToRelay,
}: RelayBatchDeps) => {
  const { batcherAddress, veaContracts, rpcOutbox } = fetchBridgeConfig(chainId);

  const batcher = getBatcher(batcherAddress, process.env.PRIVATE_KEY, rpcOutbox);

  const veaOutbox = fetchVeaOutbox(
    veaContracts[network].veaOutbox.address,
    process.env.PRIVATE_KEY,
    rpcOutbox,
    chainId
  );
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
      const [proof, [to, data]] = await Promise.all([
        fetchProofAtCount(chainId, nonce, count),
        fetchMessageDataToRelay(chainId, veaContracts[network].veaInbox.address, nonce),
      ]);

      const callData = veaOutbox.interface.encodeFunctionData("sendMessage", [proof, nonce, to, data]);
      datas.push(callData);
      targets.push(veaContracts[network].veaOutbox.address);
      values.push(0);
      batchMessages += 1;
      nonce++;
    }
    if (batchMessages > 0) {
      const tx = await batcher.batchSend(targets, values, datas, { gasLimit: 500000 });
      console.log("Batch transaction response:", tx);
      const receipt = await tx.wait();
      console.log("Batch transaction receipt:", receipt);
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
  network: Networks,
  nonce: number,
  msgSenders: string[]
): Promise<number> => {
  const { veaContracts, batcherAddress, rpcOutbox } = getBridgeConfig(chainId);

  const batcher = getBatcher(batcherAddress, process.env.PRIVATE_KEY, rpcOutbox);

  const veaOutbox = getVeaOutbox(veaContracts[network].veaOutbox.address, process.env.PRIVATE_KEY, rpcOutbox, chainId);
  const count = await getCount(veaOutbox, chainId);

  if (!count) return null;
  let targets: string[] = [];
  let values: number[] = [];
  let datas: string[] = [];
  let lastNonce = null;
  for (const msgSender of msgSenders) {
    const nonces = await getNonceFrom(chainId, veaContracts[network].veaInbox.address, nonce, msgSender);

    for (const x of nonces) {
      const [proof, [to, data]] = await Promise.all([
        getProofAtCount(chainId, x, count),
        getMessageDataToRelay(chainId, veaContracts[network].veaInbox.address, x),
      ]);
      const callData = veaOutbox.interface.encodeFunctionData("sendMessage", [proof, nonce, to, data]);
      datas.push(callData);
      targets.push(veaContracts[network].veaOutbox.address);
      values.push(0);
      lastNonce = x;
    }
  }

  if (lastNonce != null) {
    const tx = await batcher.batchSend(targets, values, datas, { gasLimit: 500000 });
    console.log("Batch transaction response:", tx);
    const receipt = await tx.wait();
    console.log("Batch transaction receipt:", receipt);
  }

  return lastNonce;
};

/**
 * Get the nonces of messages sent by a given sender
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the first message to relay
 * @param msgSender The address of the sender
 * @returns The nonces of the messages sent by the sender
 */
const getNonceFrom = async (chainId: number, inbox: string, nonce: number, msgSender: string) => {
  const subgraph = process.env.RELAYER_SUBRAPGH;

  const result = await request(
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
  );

  return result[`messageSents`].map((a: { nonce: number }) => a.nonce);
};

export { relayAllFrom, relay, relayBatch, RelayBatchDeps };
