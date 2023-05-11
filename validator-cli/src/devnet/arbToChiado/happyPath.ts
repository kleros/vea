import { getVeaInboxArbToEthProvider, getVeaOutboxArbToEthDevnetProvider, getWalletRPC } from "../../utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "ethers";

require("dotenv").config();

(async () => {
  const chiadoProvider = new JsonRpcProvider(process.env.RPC_CHIADO);
  const veaOutboxChiado = getVeaOutboxArbToEthDevnetProvider(
    process.env.VEAOUTBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
    process.env.PRIVATE_KEY,
    chiadoProvider
  );

  const arbGoerliProvider = new JsonRpcProvider(process.env.RPC_ARB_GOERLI);
  const veaInboxArbGoerliToChiado = getVeaInboxArbToEthProvider(
    process.env.VEAINBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
    process.env.PRIVATE_KEY,
    arbGoerliProvider
  );
  const deposit = await veaOutboxChiado.deposit();
  const epochPeriod = (await veaOutboxChiado.epochPeriod()).toNumber();
  let currentTS = Math.floor(Date.now() / 1000);
  let currentTimeArbitrum = (await arbGoerliProvider.getBlock(await arbGoerliProvider.getBlockNumber())).timestamp;
  let claimableEpoch = Math.floor(currentTS / epochPeriod);
  console.log("currentTS", currentTS);
  console.log("currentTimeArbitrum", currentTimeArbitrum);

  if (currentTS % epochPeriod < 60) {
    console.log("Epoch is almost over. Waiting 1 min for next epoch...");
    await delay((currentTS % epochPeriod) * 1000);
    claimableEpoch++;
  }

  // only search back ~2 weeks
  // not really correct since l2 blocks are different, but just an estimate
  const searchBlock = Math.max(0, (await arbGoerliProvider.getBlockNumber()) - Math.floor(1209600 / 12));

  const logs = await arbGoerliProvider.getLogs({
    address: process.env.VEAINBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
    topics: veaInboxArbGoerliToChiado.filters.SnapshotSaved(null).topics,
    fromBlock: searchBlock,
  });

  let lastSavedCount = logs.length > 0 ? BigNumber.from(logs[logs.length - 1].data) : 0;

  while (1) {
    let currentTS = Math.floor(Date.now() / 1000);
    let claimableEpoch = Math.floor(currentTS / epochPeriod);
    const snapshot = await veaInboxArbGoerliToChiado.snapshots(claimableEpoch);

    if (snapshot == "0x0000000000000000000000000000000000000000000000000000000000000000") {
      // check if snapshot should be taken
      const inboxCount = await veaInboxArbGoerliToChiado.count();
      if (inboxCount > lastSavedCount) {
        // should take snapshot
        console.log("inbox updated: taking snapshot. . .");
        const txn = await veaInboxArbGoerliToChiado.saveSnapshot();
        delay(10000);
        let snapshot = await veaInboxArbGoerliToChiado.snapshots(claimableEpoch);
        while (snapshot == "0x0000000000000000000000000000000000000000000000000000000000000000") {
          console.log("waiting for snapshot to be saved. . .");
          snapshot = await veaInboxArbGoerliToChiado.snapshots(claimableEpoch);
          delay(30000);
        }
        console.log(`Snapshot Txn: ${txn.hash}`);
        lastSavedCount = inboxCount;
        const txnOutbox = await veaOutboxChiado.devnetAdvanceState(claimableEpoch, snapshot, { value: deposit });
        console.log(`DevnetAdvanceState Txn: ${txnOutbox.hash}`);
      } else {
        console.log("inbox not updated: not taking snapshot. . .");
      }
    } else {
      console.log("snapshot already taken. . .");
      const latestVerifiedEpoch = await veaOutboxChiado.latestVerifiedEpoch();
      if (latestVerifiedEpoch.toNumber() < claimableEpoch) {
        console.log("advancing devnet state. . .");
        const txnOutbox = await veaOutboxChiado.devnetAdvanceState(claimableEpoch, snapshot, { value: deposit });
        console.log(`DevnetAdvanceState Txn: ${txnOutbox.hash}`);
      }
    }
    currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 30000;
    console.log("waiting for the next epoch. . .", Math.floor(delayAmount / 1000), "seconds");
    await delay(delayAmount);
  }
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
