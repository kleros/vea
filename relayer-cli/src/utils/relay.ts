import { getProof, getMessageDataToRelay, getSubgraph } from "./proof";
import { getVeaOutboxArbToEth } from "./ethers";
import request from "graphql-request";

require("dotenv").config();

const Web3 = require("web3");
const _batchedSend = require("web3-batched-send");
const _contract = require("@kleros/vea-contracts/deployments/goerli/VeaOutboxArbGoerliToGoerli.json");

const getParams = (chainid: number): [string, string, string] => {
  if (chainid !== 5 && chainid !== 10200) throw new Error("Invalid chainid");

  return chainid === 5
    ? [
        process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS_GOERLI,
        process.env.VEAOUTBOX_ARBGOERLI_TO_GOERLI_ADDRESS,
        process.env.RPC_GOERLI,
      ]
    : [
        process.env.TRANSACTION_BATCHER_CONTRACT_ADDRESS_CHIADO,
        process.env.VEAOUTBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
        process.env.RPC_CHIADO,
      ];
};

const relay = async (chainid: number, nonce: number) => {
  const [TRANSACTION_BATCHER_CONTRACT_ADDRESS, VEAOUTBOX_ADDRESS, RPC_VEAOUTBOX] = getParams(chainid);

  const veaOutbox = getVeaOutboxArbToEth(VEAOUTBOX_ADDRESS, process.env.PRIVATE_KEY, RPC_VEAOUTBOX);

  const proof = await getProof(chainid, nonce);
  const [to, data] = await getMessageDataToRelay(chainid, nonce);

  const txn = await veaOutbox.sendMessage(proof, nonce, to, data);
  await txn.wait();
};

const relayBatch = async (chainid: number, nonce: number, iterations: number) => {
  const [TRANSACTION_BATCHER_CONTRACT_ADDRESS, VEAOUTBOX_ADDRESS, RPC_VEAOUTBOX] = getParams(chainid);

  const web3 = new Web3(RPC_VEAOUTBOX);
  const batchedSend = _batchedSend(web3, TRANSACTION_BATCHER_CONTRACT_ADDRESS, process.env.PRIVATE_KEY, 0);

  const contract = new web3.eth.Contract(_contract.abi, VEAOUTBOX_ADDRESS);

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

  let txns = [];

  const nonces = await getNonceFrom(chainid, nonce, msgSender);

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

const getNonceFrom = async (chainid: number, nonce: number, msgSender: string) => {
  try {
    const sugbraph = getSubgraph(chainid);

    const result = await request(
      `https://api.thegraph.com/subgraphs/name/shotaronowhere/${sugbraph}`,
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
