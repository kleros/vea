import { getVeaOutboxArbToEthProvider, getVeaInboxArbToEth } from "../utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getParams } from "../utils/veaArbToEth";
import Ethers from "@typechain/ethers-v5";

require("dotenv").config();

const watch = async () => {
  const l1provider = new JsonRpcProvider(process.env.RPC_VEAOUTBOX);

  const veaOutbox = getVeaOutboxArbToEthProvider(process.env.VEAOUTBOX_ADDRESS, process.env.PRIVATE_KEY, l1provider);

  const veaInbox = getVeaInboxArbToEth(process.env.VEAINBOX_ADDRESS, process.env.PRIVATE_KEY, process.env.RPC_VEAINBOX);

  const [deposit, epochPeriod, claimDelay, challengePeriod] = await getParams(veaOutbox);

  const currentBlockNumber = await l1provider.getBlockNumber();
  const challengableTimeStart = Math.floor(Date.now() / 1000) - challengePeriod;
  const challengableBlockStart = currentBlockNumber - Math.ceil(challengePeriod / 12);

  const logs = await l1provider.getLogs({
    address: process.env.VEAOUTBOX_ADDRESS,
    topics: veaOutbox.claims,
    fromBlock: challengableBlockStart,
  });

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const claimedTimestamp = (await l1provider.getBlock(log.blockNumber)).timestamp;
    if (claimedTimestamp < challengableTimeStart) {
      continue;
    } else {
      const claimedStateRoot = log.data;
      const claimedEpoch = Math.floor((claimedTimestamp - claimDelay) / epochPeriod);
      const inboxStateRoot = await veaInbox.snapshots(claimedEpoch);
      if (claimedStateRoot !== inboxStateRoot) {
        console.log(`Challenging claim ${claimedStateRoot} at epoch ${claimedEpoch}.`);
        const unchallengedClaim = {
          stateRoot: claimedStateRoot,
          claimer: "0x" + log.topics[1].substring(26),
          timestamp: claimedTimestamp,
          blocknumber: log.blockNumber,
          honest: "0",
          challenger: "0x0000000000000000000000000000000000000000",
        };
        const unchallengedClaimHash = await veaOutbox.hashClaim(unchallengedClaim);
        const claimHash = await veaOutbox.claimHashes(claimedEpoch);
        console.log(unchallengedClaimHash);
        console.log(claimHash);
        console.log(claimedEpoch);
        if (unchallengedClaimHash == claimHash) {
          const txn = await veaOutbox.challenge(claimedEpoch, unchallengedClaim, { value: deposit });
          console.log(`Challenge Txn: ${txn.hash}`);
        }
      }
    }
  }
};

export default watch;
