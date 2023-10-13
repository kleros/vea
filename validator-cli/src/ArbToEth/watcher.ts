import {
  VeaOutboxArbToEth__factory,
  VeaInboxArbToEth__factory,
  VeaInboxTouch__factory,
} from "@kleros/vea-contracts/typechain-types";
import { WebSocketProvider, JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { BigNumber } from "ethers";
import { TransactionRequest } from "@ethersproject/abstract-provider";

require("dotenv").config();

const watch = async () => {
  // connect to RPCs
  const providerEth = new WebSocketProvider(process.env.RPC_ETH_WSS);
  const providerArb = new JsonRpcProvider(process.env.RPC_ARB);
  const signerArb = new Wallet(process.env.PRIVATE_KEY, providerArb);
  const signerEth = new Wallet(process.env.PRIVATE_KEY, providerEth);
  // `authSigner` is an Ethereum private key that does NOT store funds and is NOT your bot's primary key.
  // This is an identifying key for signing payloads to establish reputation and whitelisting
  // In production, this should be used across multiple bundles to build relationship. In this example, we generate a new wallet each time
  const authSigner = new Wallet(process.env.FLASHBOTS_RELAY_SIGNING_KEY);

  // Flashbots provider requires passing in a standard provider
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    providerEth, // a normal ethers.js provider, to perform gas estimiations and nonce lookups
    authSigner, // ethers.js signer wallet, only for signing request payloads, not transactions
    "https://relay-goerli.flashbots.net/",
    "goerli"
  );

  const veaInbox = VeaInboxArbToEth__factory.connect(process.env.VEAINBOX_ARB_TO_ETH_ADDRESS, signerArb);
  const veaOutbox = VeaOutboxArbToEth__factory.connect(process.env.VEAOUTBOX_ARB_TO_ETH_ADDRESS, signerEth);
  const veaInboxTouch = VeaInboxTouch__factory.connect(process.env.VEAINBOX_ARB_TO_ETH_TOUCH_ADDRESS, signerArb);
  const epochPeriod = (await veaOutbox.epochPeriod()).toNumber();
  const deposit = await veaOutbox.deposit();
  const snapshotsFinalized = new Map<number, string>();

  let epochSnapshotFinalized: number = 0;

  //const gasEstimate = await retryOperation(() => veaOutbox.estimateGas["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](epoch, claim, { value: deposit }), 1000, 10) as BigNumber;
  const gasEstimate = 35000; // save time by hardcoding the gas estimate

  // deposit / 2 is the profit for challengers
  // the initial challenge txn is roughly 1/3 of the cost of completing the challenge process.
  const maxFeePerGasProfitable = deposit.div(gasEstimate * 3 * 2);

  veaOutbox.on(veaOutbox.filters["Claimed(address,uint256,bytes32)"](), async (claimer, epoch, stateRoot, event) => {
    console.log("Claimed", claimer, epoch, stateRoot);
    const block = event.getBlock();

    var claim = {
      stateRoot: stateRoot,
      claimer: claimer,
      timestampClaimed: (await block).timestamp,
      timestampVerification: 0,
      blocknumberVerification: 0,
      honest: 0,
      challenger: "0x0000000000000000000000000000000000000000",
    };

    if (epoch.toNumber() > epochSnapshotFinalized) {
      // Math.random() is not cryptographically secure, but it's good enough for this purpose.
      // can't set the seed, but multiplying by an unpredictable number (timestamp in ms) should be good enough.
      const txnTouch = veaInboxTouch.touch(Math.floor(Math.random() * Date.now()));

      (await txnTouch).wait();

      const snapshot = await veaInbox.snapshots(epoch);

      if (snapshot !== stateRoot) {
        const data = veaOutbox.interface.encodeFunctionData(
          "challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))",
          [epoch, claim]
        );

        const tx: TransactionRequest = {
          from: signerEth.address,
          to: veaOutbox.address,
          data: data,
          value: deposit,
          maxFeePerGas: maxFeePerGasProfitable,
          maxPriorityFeePerGas: BigNumber.from(66666666667), // 66.7 gwei
          gasLimit: BigNumber.from(35000),
        };
        const privateTx = {
          transaction: tx,
          signer: signerEth,
        };
        const res = await flashbotsProvider.sendPrivateTransaction(privateTx);
        console.log(res);
      }
    } else if (snapshotsFinalized.get(epoch.toNumber()) !== stateRoot) {
      const txnChallenge = veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
        epoch,
        claim,
        {
          value: deposit,
          gasLimit: gasEstimate,
          maxFeePerGas: maxFeePerGasProfitable,
          maxPriorityFeePerGas: BigNumber.from(66666666667), // 66.7 gwei
        }
      );
      console.log("Challenge txn", txnChallenge);
      const txnReceiptChallenge = (await txnChallenge).wait();
      console.log("Challenge", txnReceiptChallenge);
    }
  });

  epochSnapshotFinalized = Math.floor((await providerArb.getBlock("latest")).timestamp / epochPeriod) - 2;

  while (1) {
    const blockLatestL2 = await providerArb.getBlock("latest");
    const timeL2 = blockLatestL2.timestamp;
    const epochSnapshotFinalizedOld = epochSnapshotFinalized;
    epochSnapshotFinalized = Math.floor(timeL2 / epochPeriod) - 1;
    for (let epoch = epochSnapshotFinalizedOld + 1; epoch <= epochSnapshotFinalized; epoch++) {
      const snapshot = await veaInbox.snapshots(epoch);
      snapshotsFinalized.set(epoch, snapshot);
      console.log("Snapshot finalized", epoch, snapshot);
    }
    await wait(3000);
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const retryOperation = (operation, delay, retries) =>
  new Promise((resolve, reject) => {
    return operation()
      .then(resolve)
      .catch((reason) => {
        if (retries > 0) {
          // log retry
          console.log("retrying", retries);
          return wait(delay)
            .then(retryOperation.bind(null, operation, delay, retries - 1))
            .then(resolve)
            .catch(reject);
        }
        return reject(reason);
      });
  });

(async () => {
  await watch();
})();
export default watch;
