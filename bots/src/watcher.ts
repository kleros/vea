const sender = require("../../contracts/deployments/arbitrumGoerli/FastBridgeSenderToGnosis.json");
const receiver = require("../../contracts/deployments/chiado/FastBridgeReceiverOnGnosis.json");
const Web3 = require("web3");
require("dotenv").config();

(async () => {
  const web3_sender = new Web3(process.env.RPC_SENDER);
  const web3_receiver = new Web3(process.env.RPC_RECEIVER);
  const account = web3_sender.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
  web3_receiver.eth.accounts.wallet.add(account);

  const senderInstance = new web3_sender.eth.Contract(sender.abi, process.env.SENDER_ADDRESS);

  const receiverInstance = new web3_receiver.eth.Contract(receiver.abi, process.env.RECEIVER_ADDRESS);

  const senderChainID = await web3_sender.eth.getChainId();
  const receiverChainID = await web3_receiver.eth.getChainId();
  const deposit = await receiverInstance.methods.deposit().call();
  const challengePeriod = await receiverInstance.methods.challengePeriod().call();
  const epochPeriod = await receiverInstance.methods.epochPeriod().call();
  const currentTS = Math.floor(Date.now() / 1000);
  const currentEpoch = Math.floor(currentTS / epochPeriod);
  const challengableEpochStart = Math.floor((currentTS - challengePeriod) / epochPeriod);

  console.log(`Sending Chain ID: ${senderChainID}`);
  console.log(`Receiver Chain ID: ${receiverChainID}`);
  console.log(`---`);
  console.log(`Current Timestamp: ${currentTS}`);
  console.log(`Current Epoch: ${currentEpoch}`);
  console.log(`Epoch Period: ${epochPeriod}`);
  console.log(`Challenge Period: ${challengePeriod}`);
  console.log(`---`);

  let cursor = challengableEpochStart;
  while (cursor <= currentEpoch) {
    const claim = await receiverInstance.methods.claims(cursor).call();
    if (claim.bridger != "0x0000000000000000000000000000000000000000") {
      const merkleroot = await senderInstance.methods.fastOutbox(cursor).call();
      if (merkleroot !== claim.batchMerkleRoot) {
        console.log(`Epoch ${cursor}: *INVALID CLAIM*`);
        const receipt = await receiverInstance.methods.challenges(cursor).call();
        if (receipt.challenger == "0x0000000000000000000000000000000000000000") {
          const txn = await receiverInstance.methods
            .challenge(cursor)
            .send({ from: web3_receiver.eth.accounts.wallet[0].address, gas: 100000, value: deposit });
          console.log(`Epoch ${cursor}: Challenged`);
          console.log(`Challenge Txn: ${txn.transactionHash}`);
        }
      }
    } else console.log(`Epoch ${cursor}: No claim.`);
    cursor++;
  }
})();
