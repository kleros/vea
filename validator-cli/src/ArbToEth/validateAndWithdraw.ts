import { getVeaInboxArbToEthProvider, getVeaOutboxArbToEthProvider } from "./utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { takeSnapshot, getParams, claim } from "./utils/veaArbToEth";
import { BigNumber } from "ethers";

require("dotenv").config();

(async () => {
  const l1provider = new JsonRpcProvider(process.env.RPC_VEAOUTBOX);

  const veaOutbox = getVeaOutboxArbToEthProvider(process.env.VEAOUTBOX_ADDRESS, process.env.PRIVATE_KEY, l1provider);

  const l2provider = new JsonRpcProvider(process.env.RPC_VEAINBOX);

  const veaInbox = getVeaInboxArbToEthProvider(process.env.VEAINBOX_ADDRESS, process.env.PRIVATE_KEY, l2provider);

  const [deposit, epochPeriod, claimDelay] = await getParams(veaOutbox);
  let currentTS = Math.floor(Date.now() / 1000);

  while (1) {
    let currentTS = Math.floor(Date.now() / 1000);
    let currentEpoch = Math.floor(currentTS / epochPeriod);
    const claim = await veaOutbox.claimHashes(currentEpoch);
    const currentBlock = await l1provider.getBlockNumber();
    const logs = await l1provider.getLogs({
      address: process.env.VEAOUTBOX_ADDRESS,
      topics: veaOutbox.filters.Claimed(null, null).topics,
      fromBlock: currentBlock - Math.floor((epochPeriod * 2) / 15),
    });

    if (logs.length > 0) {
      const claimedTimestamp = (await l1provider.getBlock(logs[0].blockNumber)).timestamp;
      const claimedStateRoot = logs[0].data;

      let unchallengedClaim = {
        stateRoot: claimedStateRoot,
        claimer: "0x209469C921db9d5Bd77084370e80B63d5cdD63C1",
        timestamp: claimedTimestamp,
        blocknumber: logs[0].blockNumber,
        honest: 0,
        challenger: "0x0000000000000000000000000000000000000000",
      };
      veaOutbox.validateSnapshot(currentEpoch, unchallengedClaim);
      unchallengedClaim.honest = 1;
      veaOutbox.withdrawClaimDeposit(currentEpoch, unchallengedClaim);
    }
    currentTS = Math.floor(Date.now() / 1000);
    console.log("waiting for the next epoch and challenge period to elapse. . .");
    await delay(Math.floor((currentTS % epochPeriod) + epochPeriod / 2) * 1000 + 60000);
  }
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
