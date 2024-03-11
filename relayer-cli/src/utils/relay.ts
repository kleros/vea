import { getProofAtCount, getMessageDataToRelay, getSubgraph } from "./proof";
import { getVeaOutboxArbToEth } from "./ethers";
import request from "graphql-request";
import { VeaInboxArbToEth, VeaOutboxArbToEth } from "@kleros/vea-contracts/typechain-types";
const fs = require("fs");

require("dotenv").config();

const Web3 = require("web3");
const _batchedSend = require("web3-batched-send");
const _contract = require("@kleros/vea-contracts/deployments/sepolia/VeaOutboxArbToEthDevnet.json");

const getParams = (chainid: number): [string, string, string] => {
  if (chainid !== 11155111) throw new Error("Invalid chainid");

  return [
    process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS_SEPOLIA,
    process.env.VEAOUTBOX_ARBSEPOLIA_TO_SEPOLIA_ADDRESS,
    process.env.RPC_SEPOLIA,
  ];
};

const getCount = async (veaOutbox: VeaOutboxArbToEth, chainid: number): Promise<number> => {
  const subgraph = getSubgraph(chainid);
  const stateRoot = await veaOutbox.stateRoot();

  const result = await request(
    `https://api.studio.thegraph.com/query/67213/${subgraph}/version/latest`,
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
  const [TRANSACTION_BATCHER_CONTRACT_ADDRESS, VEAOUTBOX_ADDRESS, RPC_VEAOUTBOX] = getParams(chainid);

  const veaOutbox = getVeaOutboxArbToEth(VEAOUTBOX_ADDRESS, process.env.PRIVATE_KEY, RPC_VEAOUTBOX);
  const count = await getCount(veaOutbox, chainid);

  const proof = await getProofAtCount(chainid, nonce, count);
  const [to, data] = await getMessageDataToRelay(chainid, nonce);

  const txn = await veaOutbox.sendMessage(proof, nonce, to, data);
  await txn.wait();
};

const relayBatch = async (chainid: number, nonce: number, iterations: number) => {
  const [TRANSACTION_BATCHER_CONTRACT_ADDRESS, VEAOUTBOX_ADDRESS, RPC_VEAOUTBOX] = getParams(chainid);

  const web3 = new Web3(RPC_VEAOUTBOX);
  const batchedSend = _batchedSend(web3, TRANSACTION_BATCHER_CONTRACT_ADDRESS, process.env.PRIVATE_KEY, 0);

  const contract = new web3.eth.Contract(_contract.abi, VEAOUTBOX_ADDRESS);
  const veaOutbox = getVeaOutboxArbToEth(VEAOUTBOX_ADDRESS, process.env.PRIVATE_KEY, RPC_VEAOUTBOX);
  const count = await getCount(veaOutbox, chainid);

  let txns = [];

  for (let i = 0; i < iterations; i++) {
    const proof = await getProofAtCount(chainid, nonce + i, count);
    const [to, data] = await getMessageDataToRelay(chainid, nonce + i);
    txns.push({
      args: [proof, nonce + i, to, data],
      method: contract.methods.sendMessage,
      to: contract.options.address,
    });
  }

  console.log(txns);
  await batchedSend(txns);
};

const relayAllFrom = async (chainid: number, nonce: number, msgSender: string): Promise<number> => {
  const [TRANSACTION_BATCHER_CONTRACT_ADDRESS, VEAOUTBOX_ADDRESS, RPC_VEAOUTBOX] = getParams(chainid);

  const web3 = new Web3(RPC_VEAOUTBOX);
  const batchedSend = _batchedSend(
    web3, // Your web3 object.
    // The address of the transaction batcher contract you wish to use. The addresses for the different networks are listed below. If the one you need is missing, feel free to deploy it yourself and make a PR to save the address here for others to use.
    TRANSACTION_BATCHER_CONTRACT_ADDRESS,
    process.env.PRIVATE_KEY, // The private key of the account you want to send transactions from.
    0 // The debounce timeout period in milliseconds in which transactions are batched.
  );

  const contract = new web3.eth.Contract(_contract.abi, VEAOUTBOX_ADDRESS);
  const veaOutbox = getVeaOutboxArbToEth(VEAOUTBOX_ADDRESS, process.env.PRIVATE_KEY, RPC_VEAOUTBOX);
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
    const subgraph = getSubgraph(chainid);

    const result = await request(
      `https://api.studio.thegraph.com/query/67213/${subgraph}/version/latest`,
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
