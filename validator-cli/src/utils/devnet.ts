import { BigNumber, utils } from "ethers";
import {
  getVeaInboxArbToEthProvider,
  getVeaOutboxArbToEthDevnetProvider,
  getVeaInboxArbToGnosisProvider,
  getWETHProvider,
  getVeaOutboxArbToGnosisDevnetProvider,
} from "../utils/ethers";
import {
  VeaInboxArbToEth,
  VeaInboxArbToGnosis,
  VeaOutboxArbToEthDevnet,
  VeaOutboxArbToGnosisDevnet,
} from "../../typechain-types";
import { JsonRpcProvider } from "@ethersproject/providers";

async function initialize(
  veaOutboxAddress: string,
  veaInboxAddress: string,
  outboxRPCUrl: string
): Promise<[VeaInboxArbToEth, number, BigNumber, VeaOutboxArbToEthDevnet, BigNumber]> {
  const outboxProvider = new JsonRpcProvider(outboxRPCUrl);
  const veaOutbox = getVeaOutboxArbToEthDevnetProvider(veaOutboxAddress, process.env.PRIVATE_KEY, outboxProvider);
  const arbGoerliProvider = new JsonRpcProvider(process.env.RPC_ARB_GOERLI);
  const veaInbox = getVeaInboxArbToEthProvider(veaInboxAddress, process.env.PRIVATE_KEY, arbGoerliProvider);

  const deposit = await veaOutbox.deposit();
  const epochPeriod = (await veaOutbox.epochPeriod()).toNumber();
  let currentTS = Math.floor(Date.now() / 1000);

  if (currentTS % epochPeriod < 60) {
    console.log("Epoch is almost over. Waiting 1 min for next epoch...");
    return;
  }

  // only search back 2 weeks
  // not really correct since l2 blocks are different, but just an estimate
  const searchBlock = Math.max(0, (await arbGoerliProvider.getBlockNumber()) - Math.floor(1209600 / 12));

  const logs = await veaInbox.queryFilter(veaInbox.filters.SnapshotSaved(null), searchBlock);

  let lastSavedCount = logs.length > 0 ? logs[logs.length - 1].args._count : BigNumber.from(0);
  return [veaInbox, epochPeriod, lastSavedCount, veaOutbox, deposit];
}

export async function initializeGnosis(
  veaOutboxAddress: string,
  veaInboxAddress: string,
  outboxRPCUrl: string
): Promise<[VeaInboxArbToGnosis, number, BigNumber, VeaOutboxArbToGnosisDevnet, BigNumber]> {
  const outboxProvider = new JsonRpcProvider(outboxRPCUrl);
  const veaOutbox = getVeaOutboxArbToGnosisDevnetProvider(veaOutboxAddress, process.env.PRIVATE_KEY, outboxProvider);

  const arbGoerliProvider = new JsonRpcProvider(process.env.RPC_ARB_GOERLI);
  const veaInbox = getVeaInboxArbToGnosisProvider(veaInboxAddress, process.env.PRIVATE_KEY, arbGoerliProvider);

  const deposit = await veaOutbox.deposit();
  const wethAddress = await veaOutbox.weth();
  const weth = getWETHProvider(wethAddress, process.env.PRIVATE_KEY, outboxProvider);
  const signerPublicKey = utils.computeAddress(process.env.PRIVATE_KEY);
  const allowance = await weth.allowance(signerPublicKey, veaOutbox.address);
  if (allowance < deposit) {
    await (await weth.approve(veaOutbox.address, deposit)).wait();
  }
  const epochPeriod = (await veaOutbox.epochPeriod()).toNumber();
  let currentTS = Math.floor(Date.now() / 1000);

  if (currentTS % epochPeriod < 60) {
    console.log("Epoch is almost over. Waiting 1 min for next epoch...");
    return;
  }

  // only search back 2 weeks
  // not really correct since l2 blocks are different, but just an estimate
  const searchBlock = Math.max(0, (await arbGoerliProvider.getBlockNumber()) - Math.floor(1209600 / 12));

  const logs = await veaInbox.queryFilter(veaInbox.filters.SnapshotSaved(null), searchBlock);

  let lastSavedCount = logs.length > 0 ? logs[logs.length - 1].args._count : BigNumber.from(0);
  return [veaInbox, epochPeriod, lastSavedCount, veaOutbox, deposit];
}

async function happyPath(
  isGnosis: boolean,
  veaInbox: VeaInboxArbToEth | VeaInboxArbToGnosis,
  epochPeriod: number,
  lastSavedCount: BigNumber,
  veaOutbox: VeaOutboxArbToEthDevnet | VeaOutboxArbToGnosisDevnet,
  deposit: BigNumber
) {
  let currentTS = Math.floor(Date.now() / 1000);
  let claimableEpoch = Math.floor(currentTS / epochPeriod) - 1;
  const verifiedEpoch = await veaOutbox.latestVerifiedEpoch();

  const snapshot = await veaInbox.snapshots(claimableEpoch);

  if (snapshot == "0x0000000000000000000000000000000000000000000000000000000000000000") {
    // check if snapshot should be taken
    console.log("last saved count: ", lastSavedCount.toString());
    const inboxCount = await veaInbox.count();
    console.log("inbox count: ", inboxCount.toString());
    if (inboxCount.gt(lastSavedCount)) {
      // should take snapshot
      console.log("inbox updated: taking snapshot. . .");
      const txn = await veaInbox.saveSnapshot();
      const receipt = await txn.wait();
      // take snapshot at end of epoch
      if (currentTS % epochPeriod > epochPeriod - 120) {
        const snapshot = await veaInbox.snapshots(claimableEpoch);
        console.log(`Snapshot Txn: ${txn.hash}`);
      }
    } else {
      console.log("inbox not updated: not taking snapshot. . .");
    }
  } else {
    if (verifiedEpoch.toNumber() >= claimableEpoch) {
      return;
    }
    console.log("snapshot already taken. . .");
    const latestVerifiedEpoch = await veaOutbox.latestVerifiedEpoch();
    if (latestVerifiedEpoch.toNumber() < claimableEpoch) {
      console.log("advancing devnet state. . .");
      const amount = isGnosis ? 0 : deposit;
      const txnOutbox = await veaOutbox.devnetAdvanceState(claimableEpoch, snapshot, { value: amount });
      console.log(`DevnetAdvanceState Txn: ${txnOutbox.hash}`);
    }
  }
}

export { happyPath, initialize };
