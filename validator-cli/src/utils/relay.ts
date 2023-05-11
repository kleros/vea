import { getProof, getMessageDataToRelay } from "./proof";
import { getVeaOutboxArbToEth } from "./ethers";
import request from "graphql-request";

require("dotenv").config();

const Web3 = require("web3");
const _batchedSend = require("web3-batched-send");
const _contract = require("@kleros/vea-contracts/deployments/goerli/VeaOutboxArbGoerliToGoerli.json");

const relay = async (chainid: number, nonce: number) => {
  const veaOutbox = getVeaOutboxArbToEth(
    process.env.VEAOUTBOX_ADDRESS,
    process.env.PRIVATE_KEY,
    process.env.RPC_VEAOUTBOX
  );

  const proof = await getProof(chainid, nonce);
  const [to, data] = await getMessageDataToRelay(chainid, nonce);

  const txn = await veaOutbox.sendMessage(proof, nonce, to, data);
  await txn.wait();
};

const relayBatch = async (chainid: number, nonce: number, iterations: number) => {
  const web3 = new Web3(process.env.RPC_VEAOUTBOX);
  const batchedSend = _batchedSend(web3, process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS, process.env.PRIVATE_KEY, 0);

  const contract = new web3.eth.Contract(_contract.abi, process.env.VEAOUTBOX_ADDRESS);

  let txns = [];

  for (let i = 0; i < iterations; i++) {
    const proof = await getProof(chainid, nonce + i);
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

const relayAllFrom = async (chainid: number, nonce: number, msgSender: string) => {
  const web3 = new Web3(process.env.RPC_VEAOUTBOX);
  const batchedSend = _batchedSend(
    web3, // Your web3 object.
    // The address of the transaction batcher contract you wish to use. The addresses for the different networks are listed below. If the one you need is missing, feel free to deploy it yourself and make a PR to save the address here for others to use.
    process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS,
    process.env.PRIVATE_KEY, // The private key of the account you want to send transactions from.
    10000 // The debounce timeout period in milliseconds in which transactions are batched.
  );

  const contract = new web3.eth.Contract(_contract.abi, process.env.VEAOUTBOX_ADDRESS);

  let txns = [];

  const nonces = await getNonceFrom(nonce, msgSender);

  for (const x of nonces) {
    const proof = await getProof(chainid, x);
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

const getNonceFrom = async (nonce, msgSender: string) => {
  try {
    const result = await request(
      "https://api.thegraph.com/subgraphs/name/shotaronowhere/vea-inbox-arbitrum-testing",
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
