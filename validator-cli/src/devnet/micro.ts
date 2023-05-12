import { getVeaInboxArbToEthProvider, getVeaOutboxArbToEthDevnetProvider } from "../utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "ethers";
import { VeaInboxArbToEth, VeaOutboxArbToEthDevnet } from "@kleros/vea-contracts/typechain-types";

require("dotenv").config();

(async () => {
  const goerliProvider = new JsonRpcProvider(process.env.RPC_GOERLI);
  const veaOutboxGoerli = getVeaOutboxArbToEthDevnetProvider(
    process.env.VEAOUTBOX_ARBGOERLI_TO_GOERLI_ADDRESS,
    process.env.PRIVATE_KEY,
    goerliProvider
  );

  const chiadoProvider = new JsonRpcProvider(process.env.RPC_CHIADO);
  const veaOutboxChiado = getVeaOutboxArbToEthDevnetProvider(
    process.env.VEAOUTBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
    process.env.PRIVATE_KEY,
    chiadoProvider
  );

  const arbGoerliProvider = new JsonRpcProvider(process.env.RPC_ARB_GOERLI);
  const veaInboxArbGoerliToGoerli = getVeaInboxArbToEthProvider(
    process.env.VEAINBOX_ARBGOERLI_TO_GOERLI_ADDRESS,
    process.env.PRIVATE_KEY,
    arbGoerliProvider
  );

  const veaInboxArbGoerliToChiado = getVeaInboxArbToEthProvider(
    process.env.VEAINBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
    process.env.PRIVATE_KEY,
    arbGoerliProvider
  );

  const deposit = await veaOutboxGoerli.deposit();
  const epochPeriod = (await veaOutboxGoerli.epochPeriod()).toNumber();
  let currentTS = Math.floor(Date.now() / 1000);
  let claimableEpoch = Math.floor(currentTS / epochPeriod);

  if (currentTS % epochPeriod < 60) {
    console.log("Epoch is almost over. Waiting 1 min for next epoch...");
    await delay((currentTS % epochPeriod) * 1000);
    claimableEpoch++;
  }

  // only search back 2 weeks
  // not really correct since l2 blocks are different, but just an estimate
  const searchBlock = Math.max(0, (await arbGoerliProvider.getBlockNumber()) - Math.floor(1209600 / 12));

  const logs = await arbGoerliProvider.getLogs({
    address: process.env.VEAINBOX_ARBGOERLI_TO_GOERLI_ADDRESS,
    topics: veaInboxArbGoerliToGoerli.filters.SnapshotSaved(null).topics,
    fromBlock: searchBlock,
  });

  const logsChiado = await arbGoerliProvider.getLogs({
    address: process.env.VEAINBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
    topics: veaInboxArbGoerliToChiado.filters.SnapshotSaved(null).topics,
    fromBlock: searchBlock,
  });

  let lastSavedCount = logs.length > 0 ? BigNumber.from(logs[logs.length - 1].data) : BigNumber.from(0);
  let lastSavedCountChiado = logsChiado.length > 0 ? BigNumber.from(logs[logs.length - 1].data) : BigNumber.from(0);
  const inboxCount = await veaInboxArbGoerliToGoerli.saveSnapshot();

  while (1) {
    lastSavedCount = await happyPath(veaInboxArbGoerliToGoerli, epochPeriod, lastSavedCount, veaOutboxGoerli, deposit);
    lastSavedCountChiado = await happyPath(
      veaInboxArbGoerliToChiado,
      epochPeriod,
      lastSavedCountChiado,
      veaOutboxChiado,
      deposit
    );
    currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 30000;
    console.log("waiting for the next epoch. . .", Math.floor(delayAmount / 1000), "seconds");
    await delay(delayAmount);
  }
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function happyPath(
  veaInbox: VeaInboxArbToEth,
  epochPeriod: number,
  lastSavedCount: BigNumber,
  veaOutbox: VeaOutboxArbToEthDevnet,
  deposit: BigNumber
): Promise<BigNumber> {
  let currentTS = Math.floor(Date.now() / 1000);
  let claimableEpoch = Math.floor(currentTS / epochPeriod);
  let newCount = lastSavedCount;
  const snapshot = await veaInbox.snapshots(claimableEpoch);

  if (snapshot == "0x0000000000000000000000000000000000000000000000000000000000000000") {
    // check if snapshot should be taken
    const inboxCount = await veaInbox.count();
    if (inboxCount.gt(lastSavedCount)) {
      // should take snapshot
      console.log("inbox updated: taking snapshot. . .");
      const txn = await veaInbox.saveSnapshot();
      console.log("SaveSnapshot Txn: ", txn.hash);
      console.log("New snapshot message count: ", txn.data[0]);
      newCount = BigNumber.from(txn.data[0]);
      delay(10000);
      let snapshot = await veaInbox.snapshots(claimableEpoch);
      while (snapshot == "0x0000000000000000000000000000000000000000000000000000000000000000") {
        console.log("waiting for snapshot to be saved. . .");
        snapshot = await veaInbox.snapshots(claimableEpoch);
        delay(30000);
      }
      console.log(`Snapshot Txn: ${txn.hash}`);
      lastSavedCount = inboxCount;
      const txnOutbox = await veaOutbox.devnetAdvanceState(claimableEpoch, snapshot, { value: deposit });
      console.log(`DevnetAdvanceState Txn: ${txnOutbox.hash}`);
    } else {
      console.log("inbox not updated: not taking snapshot. . .");
    }
  } else {
    console.log("snapshot already taken. . .");
    const latestVerifiedEpoch = await veaOutbox.latestVerifiedEpoch();
    if (latestVerifiedEpoch.toNumber() < claimableEpoch) {
      console.log("advancing devnet state. . .");
      const txnOutbox = await veaOutbox.devnetAdvanceState(claimableEpoch, snapshot, { value: deposit });
      console.log(`DevnetAdvanceState Txn: ${txnOutbox.hash}`);
    }
  }

  return newCount;
}
