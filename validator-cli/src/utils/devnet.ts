import { ethers } from "ethers";
import { getVeaInboxArbToEth, getVeaOutboxArbToEthDevnet } from "../utils/ethers";
import { VeaInboxArbToEth, VeaOutboxArbToEthDevnet } from "@kleros/vea-contracts/typechain-types";
import { JsonRpcProvider } from "@ethersproject/providers";

async function initialize(
  veaOutboxAddress: string,
  veaInboxAddress: string,
  outboxRPCUrl: string
): Promise<[VeaInboxArbToEth, number, bigint, VeaOutboxArbToEthDevnet, bigint]> {
  const outboxProvider = new JsonRpcProvider(outboxRPCUrl);
  const veaOutbox = getVeaOutboxArbToEthDevnet(veaOutboxAddress, process.env.PRIVATE_KEY, outboxRPCUrl);

  const arbSepoliaProvider = new JsonRpcProvider(process.env.RPC_ARB_SEPOLIA);
  const veaInbox = getVeaInboxArbToEth(veaInboxAddress, process.env.PRIVATE_KEY, process.env.RPC_ARB_SEPOLIA);

  const deposit = await veaOutbox.deposit();
  const epochPeriod = Number(await veaOutbox.epochPeriod());
  let currentTS = Math.floor(Date.now() / 1000);
  let claimableEpoch = Math.floor(currentTS / epochPeriod);

  if (currentTS % epochPeriod < 60) {
    console.log("Epoch is almost over. Waiting 1 min for next epoch...");
    await delay((currentTS % epochPeriod) * 1000);
    claimableEpoch++;
  }

  // only search back 2 weeks
  // not really correct since l2 blocks are different, but just an estimate
  const searchBlock = Math.max(0, (await arbSepoliaProvider.getBlockNumber()) - Math.floor(1209600 / 12));

  const logs = await veaInbox.queryFilter(veaInbox.filters.SnapshotSaved(null), searchBlock);

  let lastSavedCount =
    logs.length > 0
      ? ethers.AbiCoder.defaultAbiCoder().decode(["bytes32", "uint256", "uint64"], logs[logs.length - 1].data)[2]
      : BigInt(0);
  return [veaInbox, epochPeriod, lastSavedCount, veaOutbox, deposit];
}

async function happyPath(
  veaInbox: VeaInboxArbToEth,
  epochPeriod: number,
  lastSavedCount: bigint,
  veaOutbox: VeaOutboxArbToEthDevnet,
  deposit: bigint
): Promise<bigint> {
  let currentTS = Math.floor(Date.now() / 1000);
  let claimableEpoch = Math.floor(currentTS / epochPeriod);
  let newCount = lastSavedCount;
  const snapshot = await veaInbox.snapshots(claimableEpoch);

  if (snapshot == "0x0000000000000000000000000000000000000000000000000000000000000000") {
    // check if snapshot should be taken
    const inboxCount: bigint = await veaInbox.count();
    if (inboxCount > lastSavedCount) {
      // should take snapshot
      console.log("inbox updated: taking snapshot. . .");
      const txn = await veaInbox.saveSnapshot();
      const receipt = await txn.wait();

      newCount = BigInt(receipt.logs[0].data);

      const snapshot = await veaInbox.snapshots(claimableEpoch);
      console.log(`Snapshot Txn: ${txn.hash}`);
      console.log("snapshot count: ", receipt.logs[0].data);
      lastSavedCount = inboxCount;
      const txnOutbox = await veaOutbox.devnetAdvanceState(claimableEpoch, snapshot, { value: Number(deposit) });
      console.log(`DevnetAdvanceState Txn: ${txnOutbox.hash}`);
    } else {
      console.log("inbox not updated: not taking snapshot. . .");
    }
  } else {
    console.log("snapshot already taken. . .");
    const latestVerifiedEpoch = await veaOutbox.latestVerifiedEpoch();
    if (latestVerifiedEpoch < claimableEpoch) {
      console.log("advancing devnet state. . .");
      const txnOutbox = await veaOutbox.devnetAdvanceState(claimableEpoch, snapshot, { value: Number(deposit) });
      console.log(`DevnetAdvanceState Txn: ${txnOutbox.hash}`);
    }
  }

  return newCount;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { happyPath, initialize };
