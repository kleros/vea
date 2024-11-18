import {
  getVeaOutboxArbToGnosisProvider,
  getVeaInboxArbToGnosisProvider,
  getWETHProvider,
  getWalletRPC,
  getVeaRouterArbToGnosisProvider,
  getAMBProvider,
} from "../utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ChildToParentMessageStatus, ChildTransactionReceipt, getArbitrumNetwork } from "@arbitrum/sdk";
import { NODE_INTERFACE_ADDRESS } from "@arbitrum/sdk/dist/lib/dataEntities/constants";
import { NodeInterface__factory } from "@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory";
import { SequencerInbox__factory } from "@arbitrum/sdk/dist/lib/abi/factories/SequencerInbox__factory";
import { BigNumber, ContractTransaction, Wallet, constants } from "ethers";
import { Block, Log } from "@ethersproject/abstract-provider";
import { SequencerInbox } from "@arbitrum/sdk/dist/lib/abi/SequencerInbox";
import { NodeInterface } from "@arbitrum/sdk/dist/lib/abi/NodeInterface";
import {
  IAMB,
  RouterArbToGnosis,
  VeaInboxArbToGnosis,
  VeaOutboxArbToGnosis,
} from "@kleros/vea-contracts/typechain-types";
import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import messageExecutor from "../utils/arbMsgExecutor";

require("dotenv").config();

interface ChallengeProgress {
  challenge: {
    txHash: string;
    timestamp: number;
    finalized: boolean;
    status: "mined" | "pending" | "none";
  };
  snapshot: {
    txHash: string;
    timestamp: number;
    finalized: boolean;
    status: "mined" | "pending" | "none";
  };

  L2toL1Message: {
    status: ChildToParentMessageStatus;
  };
  route: {
    txHash: string;
    timestamp: number;
    finalized: boolean;
    status: "mined" | "pending" | "none";
  };
  AMB: {
    ambMessageId: string;
    txHash: string;
    timestamp: number;
    finalized: boolean;
    status: "mined" | "pending" | "none";
  };
  withdrawal: {
    txHash: string;
    timestamp: number;
    finalized: boolean;
    status: "mined" | "pending" | "none";
  };
  status:
    | "Unclaimed"
    | "Claimed"
    | "Challenged"
    | "ChallengePending"
    | "SnapshotSent"
    | "SnapshotPending"
    | "Routed"
    | "RoutePending"
    | "AMBMessageSent"
    | "AMBMessagePending"
    | "WithdrawalPending"
    | "Completed";
}
// https://github.com/prysmaticlabs/prysm/blob/493905ee9e33a64293b66823e69704f012b39627/config/params/mainnet_config.go#L103
const slotsPerEpochEth = 32;
const secondsPerSlotEth = 12;
// https://github.com/gnosischain/prysm-launch/blob/4163b9fddd57bcc07293d9a6d0723baec1fb0675/config/config.yml#L72
const slotsPerEpochGnosis = 16;
const secondsPerSlotGnosis = 5;

const veaOutboxAddress = process.env.VEAOUTBOX_ARB_TO_GNOSIS_ADDRESS;
const veaInboxAddress = process.env.VEAINBOX_ARB_TO_GNOSIS_ADDRESS;
const veaRouterAddress = process.env.VEAROUTER_ARB_TO_GNOSIS_ADDRESS;

const challenges = new Map<number, ChallengeProgress>();

const watch = async () => {
  // connect to RPCs
  const providerEth = new JsonRpcProvider(process.env.RPC_ETH);
  const providerGnosis = new JsonRpcProvider(process.env.RPC_GNOSIS);
  const providerArb = new JsonRpcProvider(process.env.RPC_ARB);

  const watcherAddress = getWalletRPC(process.env.PRIVATE_KEY, providerGnosis).address;

  // use typechain generated contract factories for vea outbox and inbox
  const veaOutbox = getVeaOutboxArbToGnosisProvider(veaOutboxAddress, process.env.PRIVATE_KEY, providerGnosis);
  const veaInbox = getVeaInboxArbToGnosisProvider(veaInboxAddress, process.env.PRIVATE_KEY, providerArb);
  const veaRouter = getVeaRouterArbToGnosisProvider(veaRouterAddress, process.env.PRIVATE_KEY, providerEth);
  const amb = getAMBProvider(process.env.PRIVATE_KEY, providerGnosis);

  const wethAddress = (await retryOperation(() => veaOutbox.weth(), 1000, 10)) as string;
  const weth = getWETHProvider(wethAddress, process.env.PRIVATE_KEY, providerGnosis);
  const balance = (await retryOperation(() => weth.balanceOf(watcherAddress), 1000, 10)) as BigNumber;
  const allowance = (await retryOperation(
    () => weth.allowance(watcherAddress, veaOutboxAddress),
    1000,
    10
  )) as BigNumber;

  // get Arb sequencer params
  const l2Network = await getArbitrumNetwork(providerArb);
  const sequencer = SequencerInbox__factory.connect(l2Network.ethBridge.sequencerInbox, providerEth);
  const maxDelaySeconds = (
    (await retryOperation(() => sequencer.maxTimeVariation(), 1000, 10))[1] as BigNumber
  ).toNumber();

  // get vea outbox params
  const deposit = (await retryOperation(() => veaOutbox.deposit(), 1000, 10)) as BigNumber;
  const epochPeriod = ((await retryOperation(() => veaOutbox.epochPeriod(), 1000, 10)) as BigNumber).toNumber();
  const sequencerDelayLimit = (
    (await retryOperation(() => veaOutbox.sequencerDelayLimit(), 1000, 10)) as BigNumber
  ).toNumber();

  const inactive = balance.lt(deposit);
  if (inactive) {
    console.error(
      "insufficient weth balance to run an active watcher. Try bridging eth to gnosis with https://omni.gnosischain.com/bridge"
    );
    console.log("running watcher in passive mode (no challenges)");
  }

  if (allowance.lt(constants.MaxUint256.div(2))) {
    console.log("setting infinite weth approval to vea outbox to prepare to challenge. . .");
    const approvalTxn = (await retryOperation(
      () => weth.approve(veaOutboxAddress, constants.MaxUint256),
      1000,
      10
    )) as ContractTransaction;
    await approvalTxn.wait();
    console.log("weth approval txn hash: " + approvalTxn.hash);
  }

  // *
  // calculate epoch range to check claims on Gnosis
  // *

  // Finalized Gnosis block provides an 'anchor point' for the vea epochs in the outbox that are claimable
  const blockFinalizedGnosis: Block = (await retryOperation(
    () => providerGnosis.getBlock("finalized"),
    1000,
    10
  )) as Block;

  const coldStartBacklog = 7 * 24 * 60 * 60; // when starting the watcher, specify an extra backlog to check
  const sevenDaysInSeconds = 7 * 24 * 60 * 60;
  // When Sequencer is malicious, even when L1 is finalized, L2 state might be unknown for up to  sequencerDelayLimit + epochPeriod.
  const L2SyncPeriod = sequencerDelayLimit + epochPeriod;
  // When we start the watcher, we need to go back far enough to check for claims which may have been pending L2 state finalization.
  const veaEpochOutboxWacthLowerBound =
    Math.floor((blockFinalizedGnosis.timestamp - L2SyncPeriod - coldStartBacklog) / epochPeriod) - 2;

  // ETH / Gnosis POS assumes synchronized clocks
  // using local time as a proxy for true "latest" L1 time
  const timeLocal = Math.floor(Date.now() / 1000);

  let veaEpochOutboxClaimableNow = Math.floor(timeLocal / epochPeriod) - 1;

  // only past epochs are claimable, hence shift by one here
  const veaEpochOutboxRange = veaEpochOutboxClaimableNow - veaEpochOutboxWacthLowerBound + 1;
  const veaEpochOutboxCheckClaimsRangeArray: number[] = new Array(veaEpochOutboxRange)
    .fill(veaEpochOutboxWacthLowerBound)
    .map((el, i) => el + i);
  // epoch => (minChallengePeriodDeadline, maxPriorityFeePerGas, maxFeePerGas)

  console.log(
    "cold start: checking past claim history from epoch " +
      veaEpochOutboxCheckClaimsRangeArray[0] +
      " to the current claimable epoch " +
      veaEpochOutboxCheckClaimsRangeArray[veaEpochOutboxCheckClaimsRangeArray.length - 1]
  );

  while (true) {
    // returns the most recent finalized arbBlock found on Ethereum and info about finality issues on Eth and Gnosis
    // if L1 is experiencing finalization problems, returns the latest arbBlock found in the latest L1 block
    const [blockArbFoundOnL1, blockFinalizedEth, finalityIssueFlagEth, blockFinalizedGnosis, finalityIssueFlagGnosis] =
      await getBlocksAndCheckFinality(providerEth, providerGnosis, providerArb, sequencer, maxDelaySeconds);

    if (!blockArbFoundOnL1) {
      console.error("Critical Error: Arbitrum block is not found on L1.");
      return;
    }

    // claims can be made for the previous epoch, hence
    // if an epoch is 2 or more epochs behind the L1 finalized epoch, no further claims can be made, we call this 'veaEpochOutboxFinalized'
    const veaEpochOutboxClaimableFinalized = Math.floor(blockFinalizedGnosis.timestamp / epochPeriod) - 2;

    const timeLocal = Math.floor(Date.now() / 1000);
    const timeGnosis = finalityIssueFlagGnosis ? timeLocal : blockFinalizedGnosis.timestamp;

    // if the sequencer is offline for maxDelaySeconds, the l2 timestamp in the next block is clamp to the current L1 timestamp - maxDelaySeconds
    const l2Time = Math.max(blockArbFoundOnL1.timestamp, blockFinalizedEth.timestamp - maxDelaySeconds);

    // the latest epoch that is finalized from the L2 POV
    // this depends on the L2 clock
    const veaEpochInboxFinalized = Math.floor(l2Time / epochPeriod) - 1;

    const veaEpochOutboxClaimableNowOld = veaEpochOutboxClaimableNow;
    veaEpochOutboxClaimableNow = Math.floor(timeGnosis / epochPeriod) - 1;
    // TODO: sometimes veaEpochOutboxClaimableNow is 1 epoch behind veaEpochOutboxClaimableNowOld
    const veaEpochsOutboxClaimableNew: number[] = new Array(veaEpochOutboxClaimableNow - veaEpochOutboxClaimableNowOld)
      .fill(veaEpochOutboxClaimableNowOld + 1)
      .map((el, i) => el + i);

    veaEpochOutboxCheckClaimsRangeArray.concat(veaEpochsOutboxClaimableNew);

    if (veaEpochOutboxCheckClaimsRangeArray.length == 0) {
      console.log("no claims to check");
      const timeToNextEpoch = epochPeriod - (Math.floor(Date.now() / 1000) % epochPeriod);
      console.log("waiting till next epoch in " + timeToNextEpoch + " seconds. . .");
      await wait(timeToNextEpoch);
    }

    for (let index = 0; index < veaEpochOutboxCheckClaimsRangeArray.length; index++) {
      const veaEpochOutboxCheck = veaEpochOutboxCheckClaimsRangeArray[index];
      console.log("checking claim for epoch " + veaEpochOutboxCheck);
      // if L1 experiences finality failure, we use the latest block
      const blockTagGnosis = finalityIssueFlagGnosis ? "latest" : "finalized";
      const claimHash = (await retryOperation(
        () => veaOutbox.claimHashes(veaEpochOutboxCheck, { blockTag: blockTagGnosis }),
        1000,
        10
      )) as string;

      // no claim
      if (claimHash == constants.HashZero) {
        // if epoch is not claimable anymore, remove from array
        if (veaEpochOutboxCheck <= veaEpochOutboxClaimableFinalized) {
          console.log(
            "no claim for epoch " +
              veaEpochOutboxCheck +
              " and the vea epoch in the outbox is finalized (can no longer be claimed)."
          );
          veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
          index--;
          if (challenges.has(index)) challenges.delete(index);
          continue;
        } else {
          console.log(
            "no claim for epoch " +
              veaEpochOutboxCheck +
              " and the vea epoch in the outbox is not finalized (can still be claimed)."
          );
        }
      } else {
        // claim exists

        console.log("claim exists for epoch " + veaEpochOutboxCheck);

        let blockNumberOutboxLowerBound: number;
        // to query event perpformantly, we limit the block range with the heuristic that. delta blocknumber <= delta timestamp / secondsPerSlot
        if (veaEpochOutboxCheck <= veaEpochOutboxClaimableFinalized) {
          blockNumberOutboxLowerBound =
            blockFinalizedGnosis.number -
            Math.ceil(
              ((veaEpochOutboxClaimableFinalized - veaEpochOutboxCheck + 2) * epochPeriod) / secondsPerSlotGnosis
            );
        } else {
          blockNumberOutboxLowerBound = blockFinalizedGnosis.number - Math.ceil(epochPeriod / secondsPerSlotGnosis);
        }

        // get claim data
        const logClaimed: Log = (
          await retryOperation(
            () =>
              providerGnosis.getLogs({
                address: veaOutboxAddress,
                topics: veaOutbox.filters.Claimed(null, [veaEpochOutboxCheck], null).topics,
                fromBlock: blockNumberOutboxLowerBound,
                toBlock: blockTagGnosis,
              }),
            1000,
            10
          )
        )[0] as Log;

        // check the snapshot on the inbox on Arbitrum
        // only check the state from L1 POV, don't trust the sequencer feed.
        // arbBlock is a recent (finalized or latest if there are finality problems) block found posted on L1
        const claimSnapshot = (await retryOperation(
          () => veaInbox.snapshots(veaEpochOutboxCheck, { blockTag: blockArbFoundOnL1.number }),
          1000,
          10
        )) as string;

        // claim differs from snapshot
        if (logClaimed.data != claimSnapshot) {
          console.log("claimed merkle root mismatch for epoch " + veaEpochOutboxCheck);

          // if Eth is finalizing but sequencer is malfunctioning, we can wait until the snapshot is considered finalized (L2 time is in the next epoch)
          if (!finalityIssueFlagEth && veaEpochInboxFinalized < veaEpochOutboxCheck) {
            // note as long as L1 does not have finalization probelms, sequencer could still be malfunctioning
            console.log("L2 snapshot is not yet finalized, waiting for finalization to determine challengable status");
            continue;
          }
          console.log("claim " + veaEpochOutboxCheck + " is challengable");
          let claim = await getClaimForEpoch(
            veaEpochOutboxCheck,
            veaOutbox,
            providerGnosis,
            blockNumberOutboxLowerBound
          );
          if (claim === null) {
            console.error("Error finding claim for epoch " + veaEpochOutboxCheck);
            continue;
          }
          console.log(veaEpochOutboxCheck, "claim found ", { claim });
          const previousProgress = challenges.get(index) || ({} as any);
          let challengeProgress = await reconstructChallengeProgress(
            veaEpochOutboxCheck,
            veaOutbox,
            veaInbox,
            veaRouter,
            providerGnosis,
            providerArb,
            providerEth,
            blockNumberOutboxLowerBound,
            amb,
            previousProgress
          );
          challenges.set(index, challengeProgress);
          console.log(
            "challenge progess for epoch " + veaEpochOutboxCheck + "  is " + JSON.stringify(challengeProgress)
          );
          //TODO : check profitablity of the whole dispute resolution
          //const profitablity = await calculateDisputeResolutionProfitability(veaEpochOutboxCheck,claim,veaOutbox,veaInbox,providerGnosis,providerArb,providerEth);
          if (claim.challenger == constants.AddressZero) {
            if (challengeProgress?.challenge.status == "pending") continue;
            const txnChallenge = (await retryOperation(
              () => veaOutbox.challenge(veaEpochOutboxCheck, claim),
              1000,
              10
            )) as ContractTransaction;
            console.log("Epoch " + veaEpochOutboxCheck + " challenged with txn " + txnChallenge.hash);
            continue;
          }
          if (claim?.challenger === watcherAddress) {
            if (challengeProgress.challenge.finalized) {
              console.log(veaEpochInboxFinalized, "A finalized challenge made by bot detected");
              if (!challengeProgress?.snapshot.txHash) {
                const txnSendSnapshot = (await retryOperation(
                  () => veaInbox.sendSnapshot(veaEpochOutboxCheck, 200000, claim), // execute transaction required around 142000 gas so  we set gas limit to 200000
                  1000,
                  10
                )) as ContractTransaction;
                console.log("Epoch " + veaEpochOutboxCheck + " sendSnapshot called with txn " + txnSendSnapshot.hash);
              }
            }
            if (
              challengeProgress.snapshot.finalized &&
              challengeProgress.snapshot.timestamp <= Math.floor(Date.now() / 1000) - sevenDaysInSeconds
            ) {
              if (challengeProgress.L2toL1Message.status === ChildToParentMessageStatus.CONFIRMED) {
                console.log("epoch " + veaEpochOutboxCheck + " L2 to L1 transaction ready to be executed");
                await messageExecutor(challengeProgress.snapshot.txHash, process.env.RPC_ARB, process.env.RPC_ETH);
              } else if (challengeProgress.L2toL1Message.status === ChildToParentMessageStatus.UNCONFIRMED)
                console.log("epoch " + veaEpochOutboxCheck + " L2 to L1 transaction waiting for confirmation");
            }
            if (challengeProgress.route.finalized && challengeProgress.AMB.finalized) {
              const txnWithdrawalDeposit = (await retryOperation(
                () => veaOutbox.withdrawChallengeDeposit(veaEpochOutboxCheck, claim),
                1000,
                10
              )) as ContractTransaction;

              if (txnWithdrawalDeposit.hash) {
                console.log(
                  "Epoch " + veaEpochOutboxCheck + " Withdrawal called with txn " + txnWithdrawalDeposit.hash
                );
                challengeProgress.withdrawal = {
                  status: "pending",
                  txHash: txnWithdrawalDeposit.hash,
                  timestamp: 0,
                  finalized: false,
                };
                challengeProgress.status = "WithdrawalPending";
                challenges.set(index, challengeProgress);
              }
            }
          }
        } else {
          console.log("claim hash matches snapshot for epoch " + veaEpochOutboxCheck);
          if (
            veaEpochOutboxCheck <= veaEpochOutboxClaimableFinalized &&
            veaEpochOutboxCheck >= veaEpochInboxFinalized
          ) {
            veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
            index--;
            continue;
          }
        }
      }
    }
    // 3 second delay for potential block and attestation propogation
    console.log("waiting 3 seconds for potential block and attestation propogation. . .");
    await wait(1000 * 3);
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const retryOperation = (operation, delay, retries) =>
  new Promise((resolve, reject) => {
    return operation()
      .then(resolve)
      .catch((reason) => {
        if (retries > 0) {
          // log retry
          console.log("retrying", retries);
          console.log(reason);
          return wait(delay)
            .then(retryOperation.bind(null, operation, delay, retries - 1))
            .then(resolve)
            .catch(reject);
        }
        return reject(reason);
      });
  });

const getBlocksAndCheckFinality = async (
  EthProvider: JsonRpcProvider,
  GnosisProvider: JsonRpcProvider,
  ArbProvider: JsonRpcProvider,
  sequencer: SequencerInbox,
  maxDelaySeconds: number
): Promise<[Block, Block, Boolean, Block, Boolean] | undefined> => {
  const blockFinalizedArb = (await retryOperation(() => ArbProvider.getBlock("finalized"), 1000, 10)) as Block;
  const blockFinalizedEth = (await retryOperation(() => EthProvider.getBlock("finalized"), 1000, 10)) as Block;
  const blockFinalizedGnosis = (await retryOperation(() => GnosisProvider.getBlock("finalized"), 1000, 10)) as Block;
  const finalityBuffer = 300; // 5 minutes, allows for network delays
  const maxFinalityTimeSecondsEth = (slotsPerEpochEth * 3 - 1) * secondsPerSlotEth; // finalization after 2 justified epochs
  const maxFinalityTimeSecondsGnosis = (slotsPerEpochGnosis * 3 - 1) * secondsPerSlotGnosis; // finalization after 2 justified epochs

  let finalityIssueFlagArb = false;
  let finalityIssueFlagEth = false;
  let finalityIssueFlagGnosis = false;
  // check latest arb block to see if there are any sequencer issues
  let blockLatestArb = (await retryOperation(() => ArbProvider.getBlock("latest"), 1000, 10)) as Block;
  let blockoldArb = (await retryOperation(() => ArbProvider.getBlock(blockLatestArb.number - 100), 1000, 10)) as Block;
  const arbAverageBlockTime = (blockLatestArb.timestamp - blockoldArb.timestamp) / 100;
  const maxDelayInSeconds = 7 * 24 * 60 * 60; // 7 days in seconds
  const fromBlockArbFinalized = blockFinalizedArb.number - Math.ceil(maxDelayInSeconds / arbAverageBlockTime);

  // to performantly query the sequencerInbox's SequencerBatchDelivered event on Eth, we limit the block range
  // we use the heuristic that. delta blocknumber <= delta timestamp / secondsPerSlot
  // Arb: -----------x                   <-- Finalized
  //                 ||
  //                 \/
  // Eth: -------------------------x     <-- Finalized
  //            /\
  //            ||<---------------->     <-- Math.floor((timeDiffBlockFinalizedArbL1 + maxDelaySeconds) / secondsPerSlotEth)
  //         fromBlockEth

  const timeDiffBlockFinalizedArbL1 = blockFinalizedEth.timestamp - blockFinalizedArb.timestamp;
  const fromBlockEthFinalized =
    blockFinalizedEth.number - Math.floor((timeDiffBlockFinalizedArbL1 + maxDelaySeconds) / secondsPerSlotEth);

  let blockFinalizedArbToL1Block = await ArbBlockToL1Block(
    ArbProvider,
    sequencer,
    blockFinalizedArb,
    fromBlockEthFinalized,
    fromBlockArbFinalized,
    false
  );

  if (!blockFinalizedArbToL1Block) {
    console.error("Arbitrum finalized block is not found on L1.");
    finalityIssueFlagArb = true;
  } else if (Math.abs(blockFinalizedArbToL1Block[0].timestamp - blockFinalizedArb.timestamp) > 1800) {
    // The L2 timestamp is drifted from the L1 timestamp in which the L2 block is posted.
    console.error("Finalized L2 block time is more than 30 min drifted from L1 clock.");
  }

  // blockLatestArbToL1Block[0] is the L1 block, blockLatestArbToL1Block[1] is the L2 block (fallsback on latest L2 block if L2 block is not found on L1)
  let blockLatestArbToL1Block = await ArbBlockToL1Block(
    ArbProvider,
    sequencer,
    blockLatestArb,
    fromBlockEthFinalized,
    fromBlockArbFinalized,
    true
  );

  if (finalityIssueFlagArb && !blockLatestArbToL1Block) {
    console.error("Arbitrum latest block is not found on L1.");
    // this means some issue in the arbitrum node implementation (very bad)
    return undefined;
  }

  // is blockLatestArb is not found on L1, ArbBlockToL1Block fallsback on the latest L2 block found on L1
  if (blockLatestArbToL1Block[1] != blockLatestArb.number) {
    blockLatestArb = (await retryOperation(() => ArbProvider.getBlock(blockLatestArbToL1Block[1]), 1000, 10)) as Block;
  }

  // ETH POS assumes synchronized clocks
  // using local time as a proxy for true "latest" L1 time
  const localTimeSeconds = Math.floor(Date.now() / 1000);

  // The sequencer is completely offline
  // Not necessarily a problem, but we should know about it
  if (localTimeSeconds - blockLatestArbToL1Block[0].timestamp > 1800) {
    console.error("Arbitrum sequencer is offline (from L1 'latest' POV) for atleast 30 minutes.");
  }

  // The L2 timestamp is drifted from the L1 timestamp in which the L2 block is posted.
  // Not necessarily a problem, but we should know about it
  if (Math.abs(blockLatestArbToL1Block[0].timestamp - blockLatestArb.timestamp) > 1800) {
    console.error("Latest L2 block time is more than 30 min drifted from L1 clock.");
    console.error("L2 block time: " + blockLatestArb.timestamp);
    console.error("L1 block time: " + blockLatestArbToL1Block[0].timestamp);
    console.error("L2 block number: " + blockLatestArb.number);
  }

  // Note: Using last finalized block as a proxy for the latest finalized epoch
  // Using a BeaconChain RPC would be more accurate
  if (localTimeSeconds - blockFinalizedEth.timestamp > maxFinalityTimeSecondsEth + finalityBuffer) {
    console.error("Ethereum mainnet is not finalizing");
    finalityIssueFlagEth = true;
  }

  // Note: Using last finalized block as a proxy for the latest finalized epoch
  // Using a BeaconChain RPC would be more accurate
  if (localTimeSeconds - blockFinalizedGnosis.timestamp > maxFinalityTimeSecondsGnosis + finalityBuffer) {
    console.error("Gnosis is not finalizing");
    finalityIssueFlagGnosis = true;
  }

  if (blockFinalizedEth.number < blockFinalizedArbToL1Block[0].number) {
    console.error(
      "Arbitrum 'finalized' block is posted in an L1 block which is not finalized. Arbitrum node is out of sync with L1 node. It's recommended to use the same L1 RPC as the L1 node used by the Arbitrum node."
    );
    finalityIssueFlagArb = true;
  }

  // if L1 is experiencing finalization problems, we use the latest L2 block
  const blockArbitrum = finalityIssueFlagArb || finalityIssueFlagEth ? blockLatestArb : blockFinalizedArb;

  return [blockArbitrum, blockFinalizedEth, finalityIssueFlagEth, blockFinalizedGnosis, finalityIssueFlagGnosis];
};

const ArbBlockToL1Block = async (
  L2Provider: JsonRpcProvider,
  sequencer: SequencerInbox,
  L2Block: Block,
  fromBlockEth: number,
  fromArbBlock: number,
  fallbackLatest: boolean
): Promise<[Block, number] | undefined> => {
  const nodeInterface = NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, L2Provider);
  let latestL2batchOnEth: number;
  let latestL2BlockNumberOnEth: number;
  let result = (await nodeInterface.functions
    .findBatchContainingBlock(L2Block.number, { blockTag: "latest" })
    .catch((e) => {})) as [BigNumber] & { batch: BigNumber };

  if (!result) {
    if (!fallbackLatest) {
      return undefined;
    } else {
      [latestL2batchOnEth, latestL2BlockNumberOnEth] = await findLatestL2BatchAndBlock(
        nodeInterface,
        fromArbBlock,
        L2Block.number
      );
    }
  }
  const batch = result?.batch?.toNumber() ?? latestL2batchOnEth;
  const L2BlockNumberFallback = latestL2BlockNumberOnEth ?? L2Block.number;
  /**
   * We use the batch number to query the L1 sequencerInbox's SequencerBatchDelivered event
   * then, we get its emitted transaction hash.
   */
  const queryBatch = sequencer.filters.SequencerBatchDelivered(batch);

  const emittedEvent = (await retryOperation(
    () => sequencer.queryFilter(queryBatch, fromBlockEth, "latest"),
    1000,
    10
  )) as any;
  if (emittedEvent.length == 0) {
    return undefined;
  }

  const L1Block = (await retryOperation(() => emittedEvent[0].getBlock(), 1000, 10)) as Block;
  return [L1Block, L2BlockNumberFallback];
};

const findLatestL2BatchAndBlock = async (
  nodeInterface: NodeInterface,
  fromArbBlock: number,
  latestBlockNumber: number
): Promise<[number, number]> => {
  let low = fromArbBlock;
  let high = latestBlockNumber;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      (await nodeInterface.functions.findBatchContainingBlock(mid, { blockTag: "latest" })) as any;
      low = mid + 1;
    } catch (e) {
      high = mid - 1;
    }
  }
  if (high < low) return [undefined, undefined];
  // high is now the latest L2 block number that has a corresponding batch on L1
  const result = (await nodeInterface.functions
    .findBatchContainingBlock(high, { blockTag: "latest" })
    .catch(console.error)) as any;
  return [result.batch.toNumber(), high];
};

async function getClaimForEpoch(
  epoch: number,
  veaOutbox: VeaOutboxArbToGnosis,
  providerGnosis: JsonRpcProvider,
  blockNumberOutboxLowerBound: number
) {
  // Get the claim hash from the contract
  const claimHash = (await retryOperation(() => veaOutbox.claimHashes(epoch), 1000, 10)) as any;

  // If there's no claim, return null
  if (claimHash === constants.HashZero) {
    return null;
  }

  // Query for the Claimed event
  const claimedFilter = veaOutbox.filters.Claimed(null, epoch, null);
  const claimedEvents = (await retryOperation(
    () =>
      providerGnosis.getLogs({
        ...claimedFilter,
        fromBlock: blockNumberOutboxLowerBound,
        toBlock: "latest",
      }),
    1000,
    10
  )) as any;

  // If we can't find the event, something is wrong
  if (claimedEvents.length === 0) {
    console.error(`No Claimed event found for epoch ${epoch}`);
    return null;
  }

  // Parse the event data
  const event = veaOutbox.interface.parseLog(claimedEvents[0]);

  const timestampClaimed = (
    (await retryOperation(() => providerGnosis.getBlock(claimedEvents[0].blockNumber), 1000, 10)) as any
  ).timestamp;
  // Reconstruct the basic claim struct
  let claim = {
    stateRoot: event.args._stateRoot,
    claimer: event.args._claimer,
    timestampClaimed: timestampClaimed,
    timestampVerification: 0,
    blocknumberVerification: 0,
    honest: 0, // 0 for None, 1 for Claimer, 2 for Challenger
    challenger: constants.AddressZero,
  };
  let other = {} as any;
  let calculatedHash = await retryOperation(() => veaOutbox.hashClaim(claim), 1000, 10);
  if (calculatedHash == claimHash) return claim;

  // Check for Challenged event
  const challengedFilter = veaOutbox.filters.Challenged(epoch, null);
  const challengedEvents = (await retryOperation(
    () =>
      providerGnosis.getLogs({
        ...challengedFilter,
        fromBlock: claimedEvents[0].blockNumber,
        toBlock: "latest",
      }),
    1000,
    10
  )) as any;

  if (challengedEvents.length > 0) {
    const challengeEvent = veaOutbox.interface.parseLog(challengedEvents[challengedEvents.length - 1]);
    claim.challenger = challengeEvent.args._challenger;
    other.challengeBlock = challengedEvents[0].blockNumber;
  }

  calculatedHash = await retryOperation(() => veaOutbox.hashClaim(claim), 1000, 10);
  if (calculatedHash == claimHash) return claim;

  // Check for VerificationStarted event
  const verificationStartedFilter = veaOutbox.filters.VerificationStarted(epoch);

  const verificationStartedEvents = (await retryOperation(
    () =>
      providerGnosis.getLogs({
        ...verificationStartedFilter,
        fromBlock: blockNumberOutboxLowerBound,
        toBlock: "latest",
      }),
    1000,
    10
  )) as any;

  if (verificationStartedEvents.length > 0) {
    const verificationBlock = await providerGnosis.getBlock(
      verificationStartedEvents[verificationStartedEvents.length - 1].blockNumber
    );
    claim.timestampVerification = verificationBlock.timestamp;
    claim.blocknumberVerification = verificationBlock.number;
    claim.challenger = constants.AddressZero;
  }

  calculatedHash = await retryOperation(() => veaOutbox.hashClaim(claim), 1000, 10);
  if (calculatedHash == claimHash) return claim;

  const [claimBridgerHonest, claimChallengerHonest] = await Promise.all([
    retryOperation(() => veaOutbox.hashClaim({ ...claim, honest: 1 }), 1000, 10) as any,
    retryOperation(() => veaOutbox.hashClaim({ ...claim, honest: 2 }), 1000, 10) as any,
  ]);

  if (claimBridgerHonest === claimHash) return { ...claim, honest: 1 };
  if (claimChallengerHonest === claimHash) return { ...claim, honest: 2 };
  return null;
}

async function calculateDisputeResolutionProfitability(
  epoch: number,
  claim: ClaimStruct,
  veaOutbox: VeaOutboxArbToGnosis,
  veaInbox: VeaInboxArbToGnosis,
  providerGnosis: JsonRpcProvider,
  providerArb: JsonRpcProvider,
  providerEth: JsonRpcProvider
): Promise<{ profitable: boolean; estimatedProfit: BigNumber }> {
  try {
    const deposit = (await retryOperation(() => veaOutbox.deposit(), 1000, 10)) as BigNumber;
    const totalReward = deposit;
    const minimumProfit = totalReward.mul(40).div(100); // 40% of total reward
    let maximumAllowableCost = totalReward.sub(minimumProfit);
    let totalCost = BigNumber.from(0);

    // 1. Costs on Gnosis Chain
    const gnosisGasEstimate = await veaOutbox.estimateGas.challenge(epoch, claim);

    const gnosisGasPrice = await providerGnosis.getGasPrice();
    const gnosisCost = gnosisGasEstimate.mul(gnosisGasPrice);

    if (gnosisCost.gt(maximumAllowableCost)) {
      return { profitable: false, estimatedProfit: constants.Zero };
    }
    totalCost = totalCost.add(gnosisCost);
    maximumAllowableCost = maximumAllowableCost.sub(gnosisCost);

    const l2Network = await getArbitrumNetwork(providerArb);

    const arbGasEstimate = (await retryOperation(
      () => veaInbox.estimateGas.sendSnapshot(epoch, 200000, claim),
      1000,
      10
    )) as BigNumber;

    const arbGasPrice = (await retryOperation(() => providerArb.getGasPrice(), 1000, 10)) as BigNumber;
    const arbCost = arbGasEstimate.mul(arbGasPrice);

    if (arbCost.gt(maximumAllowableCost)) {
      return { profitable: false, estimatedProfit: constants.Zero };
    }
    totalCost = totalCost.add(arbCost);
    maximumAllowableCost = maximumAllowableCost.sub(arbCost);

    // 3. Costs on Ethereum (for Arbitrum -> Ethereum message)
    //TODO : L2 to L1 message execution gas cost
  } catch (error) {
    console.error("Error calculating profitability:", error);
    return { profitable: false, estimatedProfit: constants.Zero };
  }
}

function needsRetry(current: ChallengeProgress, previous: ChallengeProgress | undefined): boolean {
  if (!previous) return false;

  // Check if any pending transaction has been pending too long
  const MAX_PENDING_TIME = 3600; // 1 hour
  const now = Math.floor(Date.now() / 1000);

  // Helper to check if a state needs retry
  const stateNeedsRetry = (state) => state.status === "pending" && now - state.timestamp > MAX_PENDING_TIME;

  return (
    stateNeedsRetry(current.challenge) ||
    stateNeedsRetry(current.snapshot) ||
    stateNeedsRetry(current.route) ||
    stateNeedsRetry(current.AMB)
  );
}

async function reconstructChallengeProgress(
  epoch: number,
  veaOutbox: VeaOutboxArbToGnosis,
  veaInbox: VeaInboxArbToGnosis,
  router: RouterArbToGnosis,
  providerGnosis: JsonRpcProvider,
  providerArb: JsonRpcProvider,
  providerEth: JsonRpcProvider,
  blockNumberOutboxLowerBound: number,
  amb: IAMB,
  previousProgress?: ChallengeProgress
): Promise<ChallengeProgress> {
  const emptyState = {
    txHash: "",
    timestamp: 0,
    blockNumber: 0,
    finalized: false,
    status: "none" as const,
  };

  const challengeProgress: ChallengeProgress = {
    challenge: { ...emptyState },
    snapshot: { ...emptyState },
    route: { ...emptyState },
    AMB: {
      ...emptyState,
      ambMessageId: "",
    },
    withdrawal: { ...emptyState },
    L2toL1Message: {
      status: ChildToParentMessageStatus.UNCONFIRMED,
    },
    status: "Unclaimed",
  };

  // Get current and finalized blocks for all chains with retry
  const [gnosisFinalized, gnosisLatest] = await Promise.all([
    retryOperation(() => providerGnosis.getBlock("finalized"), 1000, 10) as any,
    retryOperation(() => providerGnosis.getBlock("latest"), 1000, 10) as any,
  ]);

  // Check for claim with retry
  const claimedFilter = veaOutbox.filters.Claimed(null, epoch, null);
  const claimedLogs = (await retryOperation(
    () =>
      providerGnosis.getLogs({
        ...claimedFilter,
        fromBlock: blockNumberOutboxLowerBound,
        toBlock: gnosisFinalized.number,
      }),
    1000,
    10
  )) as any;

  if (claimedLogs.length === 0) {
    return challengeProgress;
  }

  challengeProgress.status = "Claimed";

  // Check challenge status with retry
  if (previousProgress?.challenge?.status === "pending") {
    const tx = (await retryOperation(
      () => providerGnosis.getTransaction(previousProgress.challenge.txHash),
      1000,
      10
    )) as any;
    if (tx) {
      if (!tx.blockNumber) {
        return previousProgress;
      }
    }
  }

  const challengedFilter = veaOutbox.filters.Challenged(epoch, null);
  const challengeLogs = (await retryOperation(
    () =>
      providerGnosis.getLogs({
        ...challengedFilter,
        fromBlock: claimedLogs[0].blockNumber,
        toBlock: "latest",
      }),
    1000,
    10
  )) as any;

  if (challengeLogs.length === 0) {
    return challengeProgress;
  }

  const challengeBlock = (await retryOperation(
    () => providerGnosis.getBlock(challengeLogs[0].blockNumber),
    1000,
    10
  )) as any;

  challengeProgress.challenge = {
    txHash: challengeLogs[0].transactionHash,
    timestamp: challengeBlock.timestamp,
    finalized: challengeLogs[0].blockNumber <= gnosisFinalized.number,
    status: "mined",
  };
  challengeProgress.status = "Challenged";

  // Check snapshot status on Arbitrum with retry
  if (previousProgress?.snapshot?.status === "pending") {
    const tx = (await retryOperation(
      () => providerArb.getTransaction(previousProgress.snapshot.txHash),
      1000,
      10
    )) as any;
    if (tx && !tx.blockNumber) {
      return {
        ...challengeProgress,
        status: "SnapshotPending",
      };
    }
  }

  // Get Arbitrum blocks with retry
  const [arbFinalized, arbLatest] = await Promise.all([
    retryOperation(() => providerArb.getBlock("finalized"), 1000, 10) as any,
    retryOperation(() => providerArb.getBlock("latest"), 1000, 10) as any,
  ]);

  const averageArbitrumBlocktime = 0.26;
  const estimatedArbBlocks = Math.ceil((arbLatest.timestamp - challengeBlock.timestamp) / averageArbitrumBlocktime);

  const snapshotSentFilter = veaInbox.filters.SnapshotSent(epoch, null);
  const snapshotLogs = (await retryOperation(
    () =>
      providerArb.getLogs({
        ...snapshotSentFilter,
        fromBlock: arbLatest.number - estimatedArbBlocks,
        toBlock: "latest",
      }),
    1000,
    10
  )) as any;

  if (snapshotLogs.length === 0) {
    return challengeProgress;
  }

  const snapshotBlock = (await retryOperation(
    () => providerArb.getBlock(snapshotLogs[0].blockNumber),
    1000,
    10
  )) as any;

  challengeProgress.snapshot = {
    txHash: snapshotLogs[0].transactionHash,
    timestamp: snapshotBlock.timestamp,
    finalized: snapshotLogs[0].blockNumber <= arbFinalized.number,
    status: "mined",
  };
  challengeProgress.status = "SnapshotSent";

  const snapshotTxnReceipt = (await retryOperation(
    () => providerArb.getTransactionReceipt(challengeProgress?.snapshot.txHash),
    1000,
    10
  )) as any;

  const messageReceipt = new ChildTransactionReceipt(snapshotTxnReceipt);
  const parentSigner = new Wallet(process.env.PRIVATE_KEY, providerEth);
  const messages = await messageReceipt.getChildToParentMessages(parentSigner);
  const childToParentMessage = messages[0];
  if (!childToParentMessage) {
    throw new Error("No child-to-parent messages found");
  }
  const status = await childToParentMessage.status(providerArb);

  challengeProgress.L2toL1Message.status = status;

  // Check route status on Ethereum with retry
  if (previousProgress?.route?.status === "pending") {
    const tx = (await retryOperation(() => providerEth.getTransaction(previousProgress.route.txHash), 1000, 10)) as any;
    if (tx && !tx.blockNumber) {
      return {
        ...challengeProgress,
        status: "RoutePending",
      };
    }
  }

  // Get Ethereum blocks with retry
  const [ethFinalized, ethLatest] = (await Promise.all([
    retryOperation(() => providerEth.getBlock("finalized"), 1000, 10),
    retryOperation(() => providerEth.getBlock("latest"), 1000, 10),
  ])) as any;

  const estimatedEthBlocks = Math.ceil((ethLatest.timestamp - snapshotBlock.timestamp) / secondsPerSlotEth);

  const routedFilter = router.filters.Routed(epoch, null);
  const routedLogs = (await retryOperation(
    () =>
      providerEth.getLogs({
        ...routedFilter,
        fromBlock: ethLatest.number - estimatedEthBlocks,
        toBlock: "latest",
      }),
    1000,
    10
  )) as any;

  if (routedLogs.length === 0) {
    return challengeProgress;
  }

  const routeBlock = (await retryOperation(() => providerEth.getBlock(routedLogs[0].blockNumber), 1000, 10)) as any;

  challengeProgress.route = {
    txHash: routedLogs[0].transactionHash,
    timestamp: routeBlock.timestamp,
    finalized: routedLogs[0].blockNumber <= ethFinalized.number,
    status: "mined",
  };
  challengeProgress.status = "Routed";

  // Check AMB message status on Gnosis with retry
  if (previousProgress?.AMB?.status === "pending") {
    const tx = (await retryOperation(
      () => providerGnosis.getTransaction(previousProgress.AMB.txHash),
      1000,
      10
    )) as any;
    if (tx && !tx.blockNumber) {
      return {
        ...challengeProgress,
        status: "AMBMessagePending",
      };
    }
  }

  const estimatedGnosisBlocks = Math.ceil((gnosisLatest.timestamp - routeBlock.timestamp) / secondsPerSlotGnosis);

  const messageId = routedLogs[0].data;

  const ambFilter = amb.filters.AffirmationCompleted(null, null, messageId, null);
  const ambLogs = (await retryOperation(
    () =>
      providerGnosis.getLogs({
        ...ambFilter,
        fromBlock: gnosisLatest.number - estimatedGnosisBlocks,
        toBlock: "latest",
      }),
    1000,
    10
  )) as any;

  if (ambLogs.length > 0) {
    const ambBlock = (await retryOperation(() => providerGnosis.getBlock(ambLogs[0].blockNumber), 1000, 10)) as any;

    challengeProgress.AMB = {
      ambMessageId: messageId,
      txHash: ambLogs[0].transactionHash,
      timestamp: ambBlock.timestamp,
      finalized: ambLogs[0].blockNumber <= gnosisFinalized.number,
      status: "mined",
    };
    challengeProgress.status = "AMBMessageSent";
  }

  if (previousProgress?.withdrawal?.status === "pending") {
    const tx = (await retryOperation(
      () => providerGnosis.getTransaction(previousProgress.withdrawal.txHash),
      1000,
      10
    )) as any;
    if (tx && !tx.blockNumber) {
      return {
        ...challengeProgress,
        status: "WithdrawalPending",
      };
    }
  }

  // there is no event in case of withdrawal hence no way to track it ,
  // but if a withdrawal is processed ,claimHash for the epoch will be deleted ,challenged progess will not be recontructed in the first place.
  return challengeProgress;
}

(async () => {
  retryOperation(() => watch(), 1000, 10);
})();
export default watch;
