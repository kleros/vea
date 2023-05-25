import { getVeaOutboxArbToEthProvider, getVeaInboxArbToEth } from "../utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { arbToEthDevnet, IBridge } from "../utils/contracts";
import envVar from "../utils/envVar";
import baseLogger from "../utils/logger";

const watch = async () => {
  const bridge: IBridge = arbToEthDevnet;
  const logger = baseLogger.child({
    bridge: bridge.label,
    inbox: bridge.inboxAddress,
    outbox: bridge.outboxAddress,
  });
  logger.info("Watching for claims...");
  logger.debug("Inbox RPC: %s", bridge.inboxRpc);
  logger.debug("Outbox RPC: %s", bridge.outboxRpc);

  const privateKey = envVar("PRIVATE_KEY");
  const rpcProviderOutbox = new JsonRpcProvider(bridge.outboxRpc);
  const veaOutbox = getVeaOutboxArbToEthProvider(bridge.outboxAddress, privateKey, rpcProviderOutbox);
  const veaInbox = getVeaInboxArbToEth(bridge.inboxAddress, privateKey, bridge.inboxRpc);

  const deposit = await veaOutbox.deposit();
  const epochPeriod = (await veaOutbox.epochPeriod()).toNumber();
  const claimDelay = (await veaOutbox.claimDelay()).toNumber();
  const challengePeriod = (await veaOutbox.challengePeriod()).toNumber();

  const currentBlockNumber = await rpcProviderOutbox.getBlockNumber();
  const challengeableTimeStart = Math.floor(Date.now() / 1000) - challengePeriod;
  const challengeableBlockStart = currentBlockNumber - Math.ceil((challengePeriod * 2) / 12);

  const logs = await rpcProviderOutbox.getLogs({
    address: bridge.outboxAddress,
    topics: veaOutbox.filters.Claimed(null, null).topics,
    fromBlock: challengeableBlockStart,
  });
  logger.info("Claim events found: %d", logs.length);

  for (var log of logs) {
    const claimedTimestamp = (await rpcProviderOutbox.getBlock(log.blockNumber)).timestamp;
    logger.info({
      stateRoot: log.data,
      claimer: "0x" + log.topics[1].substring(26),
      timestamp: claimedTimestamp,
      blocknumber: log.blockNumber,
      honest: "0",
      challenger: "0x0000000000000000000000000000000000000000",
    });
    if (claimedTimestamp < challengeableTimeStart) {
      continue;
    } else {
      const claimedStateRoot = log.data;
      const claimedEpoch = Math.floor((claimedTimestamp - claimDelay) / epochPeriod);
      const inboxStateRoot = await veaInbox.snapshots(claimedEpoch);
      if (claimedStateRoot !== inboxStateRoot) {
        logger.warn(`Challenging claim ${claimedStateRoot} at epoch ${claimedEpoch}.`);
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
        logger.warn(unchallengedClaim);
        logger.warn(unchallengedClaimHash);
        logger.warn(claimHash);
        logger.warn(claimedEpoch);
        if (unchallengedClaimHash == claimHash) {
          const txn = await veaOutbox.challenge(claimedEpoch, unchallengedClaim, { value: deposit });
          logger.warn(`Challenge Txn: ${txn.hash}`);
        }
      }
    }
  }

  // TODO: make this env var optional, skip fetch if undefined
  fetch(envVar("HEARTBEAT_URL"));
};

export default watch;
