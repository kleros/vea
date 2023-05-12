import { VeaOutboxArbToEth } from "@kleros/vea-contracts/typechain-types";
import { VeaInboxArbToEth } from "@kleros/vea-contracts/typechain-types";
import { BigNumber } from "ethers";

require("dotenv").config();

const getParams = async (veaOutbox: VeaOutboxArbToEth): Promise<[BigNumber, number, number, number]> => {
  const deposit = await veaOutbox.deposit();
  const epochPeriod = await veaOutbox.epochPeriod();
  const claimDelay = await veaOutbox.claimDelay();
  const challengePeriod = await veaOutbox.challengePeriod();
  return [deposit, epochPeriod.toNumber(), claimDelay.toNumber(), challengePeriod.toNumber()];
};

const takeSnapshot = async (veaInbox: VeaInboxArbToEth, epochPeriod: number) => {
  const currentTS = Math.floor(Date.now() / 1000);
  const snapshotEpoch = Math.floor(currentTS / epochPeriod);
  const snapshot = await veaInbox.snapshots(snapshotEpoch);
  if (snapshot != "0x0000000000000000000000000000000000000000000000000000000000000000") {
    const txn = await veaInbox.saveSnapshot();
    console.log(`Snapshot Txn: ${txn}`);
  }
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const claim = async (
  veaOutbox: VeaOutboxArbToEth,
  veaInbox: VeaInboxArbToEth,
  deposit: BigNumber,
  epochPeriod: number,
  claimDelay: number
) => {
  const currentTS = Math.floor(Date.now() / 1000);
  const claimableTime = currentTS - claimDelay;
  let claimableEpoch = Math.floor(claimableTime / epochPeriod);

  if (claimableEpoch < 0) {
    console.log("Invalid claimable epoch: epoch < 0");
    return;
  }

  const snapshotClaimableEpoch = await veaInbox.snapshots(claimableEpoch);
  if (snapshotClaimableEpoch != "0x0000000000000000000000000000000000000000000000000000000000000000") {
    const claimHash = await veaOutbox.claimHashes(claimableEpoch);
    if (claimHash == "0x0000000000000000000000000000000000000000000000000000000000000000") {
      const txn = await veaOutbox.claim(claimableEpoch, snapshotClaimableEpoch, { value: deposit });
      console.log(`Epoch ${claimableEpoch}: Claimed`);
      console.log(`Claim Txn: ${txn.hash}`);
    } else {
      console.log(`Epoch ${claimableEpoch}: Already claimed`);
    }
  }
};

export { getParams, claim, takeSnapshot };
