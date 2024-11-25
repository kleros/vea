require("dotenv").config();
import Web3 from "web3";
import initializeBatchedSend from "web3-batched-send";
import request from "graphql-request";
import { VeaOutboxArbToEth, VeaOutboxArbToGnosis } from "@kleros/vea-contracts/typechain-types";
import { getProofAtCount, getMessageDataToRelay } from "./proof";
import { getVeaOutbox } from "./ethers";
import { getBridgeConfig, getInboxSubgraph } from "../consts/bridgeRoutes";

const getCount = async (veaOutbox: VeaOutboxArbToEth | VeaOutboxArbToGnosis, chainId: number): Promise<number> => {
  const subgraph = getInboxSubgraph(chainId);
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

const relay = async (chainid: number, nonce: number) => {
  const routeParams = getBridgeConfig(chainid);
  const veaOutbox = getVeaOutbox(routeParams.veaOutboxAddress, process.env.PRIVATE_KEY, routeParams.rpcOutbox, chainid);
  const count = await getCount(veaOutbox, chainid);

  const [proof, [to, data]] = await Promise.all([
    getProofAtCount(chainid, nonce, count),
    getMessageDataToRelay(chainid, nonce),
  ]);

  const txn = await veaOutbox.sendMessage(proof, nonce, to, data);
  await txn.wait();
};

const relayBatch = async (chainid: number, nonce: number, maxBatchSize: number) => {
  const routeParams = getBridgeConfig(chainid);
  const web3 = new Web3(routeParams.rpcOutbox);
  const batchedSend = initializeBatchedSend(web3, routeParams.batcher, process.env.PRIVATE_KEY, 0);
  const veaOutboxInstance = new web3.eth.Contract(routeParams.veaOutboxContract.abi, routeParams.veaOutboxAddress);
  const veaOutbox = getVeaOutbox(routeParams.veaOutboxAddress, process.env.PRIVATE_KEY, routeParams.rpcOutbox, chainid);
  const count = await getCount(veaOutbox, chainid);

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
        getProofAtCount(chainid, nonce, count),
        getMessageDataToRelay(chainid, nonce),
      ]);
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

const relayAllFrom = async (chainid: number, nonce: number, msgSender: string): Promise<number> => {
  const routeParams = getBridgeConfig(chainid);

  const web3 = new Web3(routeParams.rpcOutbox);
  const batchedSend = initializeBatchedSend(
    web3, // Your web3 object.
    // The address of the transaction batcher contract you wish to use. The addresses for the different networks are listed below. If the one you need is missing, feel free to deploy it yourself and make a PR to save the address here for others to use.
    routeParams.batcher,
    process.env.PRIVATE_KEY, // The private key of the account you want to send transactions from.
    0 // The debounce timeout period in milliseconds in which transactions are batched.
  );

  const contract = new web3.eth.Contract(routeParams.veaOutboxContract.abi, routeParams.veaOutboxAddress);
  const veaOutbox = getVeaOutbox(routeParams.veaOutboxAddress, process.env.PRIVATE_KEY, routeParams.rpcOutbox, chainid);
  const count = await getCount(veaOutbox, chainid);

  if (!count) return null;

  let txns = [];

  const nonces = await getNonceFrom(chainid, nonce, msgSender);

  for (const x of nonces) {
    const [proof, [to, data]] = await Promise.all([
      getProofAtCount(chainid, x, count),
      getMessageDataToRelay(chainid, x),
    ]);
    txns.push({
      args: [proof, x, to, data],
      method: contract.methods.sendMessage,
      to: contract.options.address,
    });
  }

  await batchedSend(txns);

  return nonces[nonces.length - 1];
};

const getNonceFrom = async (chainid: number, nonce: number, msgSender: string) => {
  try {
    const subgraph = getInboxSubgraph(chainid);

    const result = await request(
      `https://api.studio.thegraph.com/query/${subgraph}`,
      `{
            messageSents(first: 1000, where: {nonce_gte: ${nonce}, msgSender_: {id: "${msgSender}"}}, orderBy: nonce, orderDirection: asc) {
              nonce
            }
        }`
    );

    return result[`messageSents`].map((a) => a.nonce);
  } catch (e) {
    console.log(e);
  }
};

export { relayAllFrom, relay, relayBatch };
