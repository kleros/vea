import { getProofAtCount, getMessageDataToRelay } from "./proof";
import { getVeaOutbox } from "./ethers";
import request from "graphql-request";
import { VeaOutboxArbToEth, VeaOutboxArbToGnosis } from "@kleros/vea-contracts/typechain-types";
import { getBridgeConfig, getInboxSubgraph } from "../consts/bridgeRoutes";
const fs = require("fs");

require("dotenv").config();

const Web3 = require("web3");
const _batchedSend = require("web3-batched-send");

const getCount = async (veaOutbox: VeaOutboxArbToEth | VeaOutboxArbToGnosis, chainid: number): Promise<number> => {
  const subgraph = getInboxSubgraph(chainid);
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
  const veaOutbox = getVeaOutbox(routeParams.veaOutbox, process.env.PRIVATE_KEY, routeParams.rpcOutbox, chainid);
  const count = await getCount(veaOutbox, chainid);

  const proof = await getProofAtCount(chainid, nonce, count);
  const [to, data] = await getMessageDataToRelay(chainid, nonce);

  const txn = await veaOutbox.sendMessage(proof, nonce, to, data);
  await txn.wait();
};

const relayBatch = async (chainid: number, nonce: number, maxBatchSize: number, _contract: any) => {
  const routeParams = getBridgeConfig(chainid);
  const web3 = new Web3(routeParams.rpcOutbox);
  const batchedSend = _batchedSend(web3, routeParams.batcher, process.env.PRIVATE_KEY, 0);
  const contract = new web3.eth.Contract(_contract.abi, routeParams.veaOutbox);
  const veaOutbox = getVeaOutbox(routeParams.veaOutbox, process.env.PRIVATE_KEY, routeParams.rpcOutbox, chainid);
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
      const proof = await getProofAtCount(chainid, nonce, count);
      const [to, data] = await getMessageDataToRelay(chainid, nonce);
      txns.push({
        args: [proof, nonce, to, data],
        method: contract.methods.sendMessage,
        to: contract.options.address,
      });
      batchMessages += 1;
      nonce++;
    }
    if (batchMessages > 0) {
      try {
        await batchedSend(txns);
      } catch (error) {
        console.error(`Unable to execute messgae batch(${batchMessages} msgs) from nonce:${nonce} `, error);
      }
    }
  }
  return nonce;
};

const relayAllFrom = async (chainid: number, nonce: number, msgSender: string, _contract: any): Promise<number> => {
  const routeParams = getBridgeConfig(chainid);

  const web3 = new Web3(routeParams.rpcOutbox);
  const batchedSend = _batchedSend(
    web3, // Your web3 object.
    // The address of the transaction batcher contract you wish to use. The addresses for the different networks are listed below. If the one you need is missing, feel free to deploy it yourself and make a PR to save the address here for others to use.
    routeParams.batcher,
    process.env.PRIVATE_KEY, // The private key of the account you want to send transactions from.
    0 // The debounce timeout period in milliseconds in which transactions are batched.
  );

  const contract = new web3.eth.Contract(_contract.abi, routeParams.veaOutbox);
  const veaOutbox = getVeaOutbox(routeParams.veaOutbox, process.env.PRIVATE_KEY, routeParams.rpcOutbox, chainid);
  const count = await getCount(veaOutbox, chainid);

  if (!count) return null;

  let txns = [];

  const nonces = await getNonceFrom(chainid, nonce, msgSender);

  for (const x of nonces) {
    const proof = await getProofAtCount(chainid, x, count);
    const [to, data] = await getMessageDataToRelay(chainid, x);
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
