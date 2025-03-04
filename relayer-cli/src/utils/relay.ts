require("dotenv").config();
import Web3 from "web3";
import initializeBatchedSend from "web3-batched-send";
import request from "graphql-request";
import { VeaOutboxArbToEth, VeaOutboxArbToGnosis } from "@kleros/vea-contracts/typechain-types";
import { getProofAtCount, getMessageDataToRelay } from "./proof";
import { getVeaOutbox } from "./ethers";
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
  setBatchedSend?: typeof initializeBatchedSend;
  fetchBridgeConfig?: typeof getBridgeConfig;
  fetchProofAtCount?: typeof getProofAtCount;
  fetchMessageDataToRelay?: typeof getMessageDataToRelay;
  web3?: typeof Web3;
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
  setBatchedSend = initializeBatchedSend,
  fetchVeaOutbox = getVeaOutbox,
  fetchProofAtCount = getProofAtCount,
  fetchMessageDataToRelay = getMessageDataToRelay,
  web3 = Web3,
}: RelayBatchDeps) => {
  const { batcher, veaContracts, rpcOutbox } = fetchBridgeConfig(chainId);
  const web3Instance = new web3(rpcOutbox);

  const batchedSend = setBatchedSend(web3Instance, batcher, process.env.PRIVATE_KEY, 0);
  const veaOutboxInstance = new web3Instance.eth.Contract(
    veaContracts[network].veaOutbox.abi,
    veaContracts[network].veaOutbox.address
  );
  const veaOutbox = fetchVeaOutbox(
    veaContracts[network].veaOutbox.address,
    process.env.PRIVATE_KEY,
    rpcOutbox,
    chainId
  );
  const count = await fetchCount(veaOutbox, chainId);

  while (nonce < count) {
    let batchMessages = 0;
    let txns = [];
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
      try {
        await veaOutboxInstance.methods.sendMessage(proof, nonce, to, data).call();
      } catch {
        nonce++;
        continue;
      }
      txns.push({
        args: [proof, nonce, to, data],
        method: veaOutboxInstance.methods.sendMessage,
        to: veaOutboxInstance.options.address,
      });
      batchMessages += 1;
      nonce++;
    }
    if (batchMessages > 0) {
      await batchedSend(txns);
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
  const { veaContracts, batcher, rpcOutbox } = getBridgeConfig(chainId);

  const web3 = new Web3(rpcOutbox);
  const batchedSend = initializeBatchedSend(
    web3, // Your web3 object.
    // The address of the transaction batcher contract you wish to use. The addresses for the different networks are listed below. If the one you need is missing, feel free to deploy it yourself and make a PR to save the address here for others to use.
    batcher,
    process.env.PRIVATE_KEY, // The private key of the account you want to send transactions from.
    0 // The debounce timeout period in milliseconds in which transactions are batched.
  );

  const contract = new web3.eth.Contract(veaContracts[network].veaOutbox.abi, veaContracts[network].veaOutbox.address);
  const veaOutbox = getVeaOutbox(veaContracts[network].veaOutbox.address, process.env.PRIVATE_KEY, rpcOutbox, chainId);
  const count = await getCount(veaOutbox, chainId);

  if (!count) return null;
  let txns = [];
  let lastNonce = null;
  for (const msgSender of msgSenders) {
    const nonces = await getNonceFrom(chainId, veaContracts[network].veaInbox.address, nonce, msgSender);

    for (const x of nonces) {
      const [proof, [to, data]] = await Promise.all([
        getProofAtCount(chainId, x, count),
        getMessageDataToRelay(chainId, veaContracts[network].veaInbox.address, x),
      ]);
      txns.push({
        args: [proof, x, to, data],
        method: contract.methods.sendMessage,
        to: contract.options.address,
      });
      lastNonce = x;
    }
  }

  await batchedSend(txns);

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
