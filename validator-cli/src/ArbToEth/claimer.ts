import { getVeaInboxArbToEthProvider, getVeaOutboxArbToEth } from "../utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { takeSnapshot, getParams, claim } from "../utils/veaArbToEth";
import { BigNumber } from "ethers";

require("dotenv").config();

const claimer = async () => {
  const veaOutbox = getVeaOutboxArbToEth(
    process.env.VEAOUTBOX_ADDRESS,
    process.env.PRIVATE_KEY,
    process.env.RPC_VEAOUTBOX
  );

  const l2provider = new JsonRpcProvider(process.env.RPC_VEAINBOX);

  const veaInbox = getVeaInboxArbToEthProvider(process.env.VEAINBOX_ADDRESS, process.env.PRIVATE_KEY, l2provider);

  const [deposit, epochPeriod, claimDelay] = await getParams(veaOutbox);
  let currentTS = Math.floor(Date.now() / 1000);
  let claimableTime = currentTS - claimDelay;
  let claimableEpoch = Math.floor(claimableTime / epochPeriod);

  if (epochPeriod - (claimableTime % epochPeriod) < 120) {
    console.log("Epoch is almost over. Waiting 2 min for next epoch...");
    await delay(120000);
    claimableEpoch++;
  }

  while (1) {
    currentTS = Math.floor(Date.now() / 1000);
    claimableTime = currentTS - claimDelay;
    claimableEpoch = Math.floor(claimableTime / epochPeriod);
    const snapshot = await veaInbox.snapshots(claimableEpoch);

    if (snapshot != "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log("snapshot taken. . . claiming. . .");
      await claim(veaOutbox, veaInbox, deposit, epochPeriod, claimDelay);
    } else {
      console.log(`snapshot not taken for claimable epoch ${claimableEpoch}. . .`);
    }
    currentTS = Math.floor(Date.now() / 1000);
    console.log("waiting for the next epoch. . .");
    await delay(Math.floor(currentTS % epochPeriod) * 1000 + 60000);
  }
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default claimer;
