import { getVeaInboxArbToEthProvider, getVeaOutboxArbToEthProvider } from "../utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { takeSnapshot, getParams, claim } from "../utils/veaArbToEth";
import { BigNumber } from "ethers";

require("dotenv").config();

const saveSnapshot = async () => {
  const l1provider = new JsonRpcProvider(process.env.RPC_VEAOUTBOX);

  const veaOutbox = getVeaOutboxArbToEthProvider(process.env.VEAOUTBOX_ADDRESS, process.env.PRIVATE_KEY, l1provider);

  const l2provider = new JsonRpcProvider(process.env.RPC_VEAINBOX);

  const veaInbox = getVeaInboxArbToEthProvider(process.env.VEAINBOX_ADDRESS, process.env.PRIVATE_KEY, l2provider);

  const [deposit, epochPeriod, claimDelay] = await getParams(veaOutbox);

  const logs = await l2provider.getLogs({
    address: process.env.VEAINBOX_ADDRESS,
    topics: veaInbox.filters.SnapshotSaved(null).topics,
    fromBlock: 0,
  });

  let lastSavedCount = logs.length > 0 ? BigNumber.from(logs[logs.length - 1].data) : 0;

  while (1) {
    const block = await l2provider.getBlock("latest");
    const currentEpoch = Math.floor(block.timestamp / epochPeriod);

    const snapshot = await veaInbox.snapshots(currentEpoch);
    if (snapshot == "0x0000000000000000000000000000000000000000000000000000000000000000") {
      // check if snapshot should be taken
      const inboxCount = await veaInbox.count();
      if (inboxCount > lastSavedCount) {
        // should take snapshot
        const snapshot = await veaInbox.snapshots(currentEpoch);
        if (snapshot != "0x0000000000000000000000000000000000000000000000000000000000000000") {
          console.log("inbox updated: taking snapshot. . .");
          const txn = await veaInbox.saveSnapshot();
          console.log(`Snapshot Txn: ${txn}`);
          lastSavedCount = inboxCount;
        }
      } else {
        console.log("inbox not updated: not taking snapshot. . .");
      }
    } else {
      console.log("snapshot already taken. . .");
    }
    console.log("waiting for next epoch. . .");
    const currentTS = Math.floor(Date.now() / 1000);
    await delay(Math.floor(currentTS % epochPeriod) * 1000 + 60000);
  }
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default saveSnapshot;
