const sender = require("../../contracts/deployments/arbitrumGoerli/FastBridgeSenderToGnosis.json");
const receiver = require("../../contracts/deployments/chiado/FastBridgeReceiverOnGnosis.json");
const Web3 = require("web3");
require("dotenv").config();

(async () => {
  const web3_receiver = new Web3(process.env.RPC_RECEIVER);
  const account = web3_receiver.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
  web3_receiver.eth.accounts.wallet.add(account);
  const receiverInstance = new web3_receiver.eth.Contract(receiver.abi, process.env.RECEIVER_ADDRESS);

  const receiverChainID = await web3_receiver.eth.getChainId();
  const deposit = await receiverInstance.methods.deposit().call();
  const epochPeriod = await receiverInstance.methods.epochPeriod().call();
  const currentTS = Math.floor(Date.now() / 1000);
  const currentEpoch = Math.floor(currentTS / epochPeriod);

  console.log(`Receiver Chain ID: ${receiverChainID}`);
  const falseMerkleRoot = "0xe23b6948d45c4d7ccef3408145ec5ea4b8a277b936a563a6d5704d6842ac7f26";
  const txn = await receiverInstance.methods
    .claim(currentEpoch, falseMerkleRoot)
    .send({ from: web3_receiver.eth.accounts.wallet[0].address, gas: 100000, value: deposit });
  console.log(txn);
})();
