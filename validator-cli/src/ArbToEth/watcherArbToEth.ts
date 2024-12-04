import { getVeaOutboxArbToEth, getVeaInboxArbToEth } from "../utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getArbitrumNetwork } from "@arbitrum/sdk";
import { NODE_INTERFACE_ADDRESS } from "@arbitrum/sdk/dist/lib/dataEntities/constants";
import { NodeInterface__factory } from "@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory";
import { SequencerInbox__factory } from "@arbitrum/sdk/dist/lib/abi/factories/SequencerInbox__factory";
import { ContractTransaction, ContractTransactionResponse, ethers } from "ethers";
import { Block, Log, TransactionReceipt } from "@ethersproject/abstract-provider";
import { SequencerInbox } from "@arbitrum/sdk/dist/lib/abi/SequencerInbox";
import { NodeInterface } from "@arbitrum/sdk/dist/lib/abi/NodeInterface";
import { getMessageStatus, messageExecutor } from "../utils/arbMsgExecutor";

require("dotenv").config();

// https://github.com/prysmaticlabs/prysm/blob/493905ee9e33a64293b66823e69704f012b39627/config/params/mainnet_config.go#L103
const slotsPerEpochEth = 32;
const secondsPerSlotEth = 12;

// This script monitors claims made on VeaOutbox and initiates challenges if required.
// The core flow includes:
// 1. `challenge(veaOutbox)`: Check claims and challenge if necassary.
// 2. `sendSnapshot(veaInbox)`: Send the snapshot from veaInbox for a challenged epoch.
// 3. `resolveDisputeClaim(arbitrumBridge)`: Execute the sent snapshot to resolve the dispute.
// 4. `withdrawChallengeDeposit(veaOutbox)`: Withdraw the deposit if the challenge is successful.

const watch = async () => {
  // connect to RPCs
  const providerEth = new JsonRpcProvider(process.env.RPC_ETH);
  const providerArb = new JsonRpcProvider(process.env.RPC_ARB);

  // use typechain generated contract factories for vea outbox and inbox
  const veaOutbox = getVeaOutboxArbToEth(
    process.env.VEAOUTBOX_ARB_TO_ETH_ADDRESS,
    process.env.PRIVATE_KEY,
    process.env.RPC_ETH
  );
  const veaInbox = getVeaInboxArbToEth(
    process.env.VEAINBOX_ARB_TO_ETH_ADDRESS,
    process.env.PRIVATE_KEY,
    process.env.RPC_ARB
  );

  // get Arb sequencer params
  const l2Network = await getArbitrumNetwork(providerArb);
  const sequencer = SequencerInbox__factory.connect(l2Network.ethBridge.sequencerInbox, providerEth);
  const maxDelaySeconds = Number((await retryOperation(() => sequencer.maxTimeVariation(), 1000, 10))[1]);

  // get vea outbox params
  const deposit = BigInt((await retryOperation(() => veaOutbox.deposit(), 1000, 10)) as any);
  const epochPeriod = Number(await retryOperation(() => veaOutbox.epochPeriod(), 1000, 10));
  const sequencerDelayLimit = Number(await retryOperation(() => veaOutbox.sequencerDelayLimit(), 1000, 10));

  // *
  // calculate epoch range to check claims on Eth
  // *

  // Finalized Eth block provides an 'anchor point' for the vea epochs in the outbox that are claimable
  const blockFinalizedEth: Block = (await retryOperation(() => providerEth.getBlock("finalized"), 1000, 10)) as Block;

  const coldStartBacklog = 7 * 24 * 60 * 60; // when starting the watcher, specify an extra backlog to check

  // When Sequencer is malicious, even when L1 is finalized, L2 state might be unknown for up to  sequencerDelayLimit + epochPeriod.
  const L2SyncPeriod = sequencerDelayLimit + epochPeriod;
  // When we start the watcher, we need to go back far enough to check for claims which may have been pending L2 state finalization.
  const veaEpochOutboxWatchLowerBound =
    Math.floor((blockFinalizedEth.timestamp - L2SyncPeriod - coldStartBacklog) / epochPeriod) - 2;

  // ETH / Gnosis POS assumes synchronized clocks
  // using local time as a proxy for true "latest" L1 time
  const timeLocal = Math.floor(Date.now() / 1000);

  let veaEpochOutboxClaimableNow = Math.floor(timeLocal / epochPeriod) - 1;

  // only past epochs are claimable, hence shift by one here
  const veaEpochOutboxRange = veaEpochOutboxClaimableNow - veaEpochOutboxWatchLowerBound + 1;
  const veaEpochOutboxCheckClaimsRangeArray: number[] = new Array(veaEpochOutboxRange)
    .fill(veaEpochOutboxWatchLowerBound)
    .map((el, i) => el + i);

  console.log(
    "cold start: checking past claim history from epoch " +
      veaEpochOutboxCheckClaimsRangeArray[0] +
      " to the current claimable epoch " +
      veaEpochOutboxCheckClaimsRangeArray[veaEpochOutboxCheckClaimsRangeArray.length - 1]
  );

  const challengeTxnHashes = new Map<number, string>();

  while (true) {
    // returns the most recent finalized arbBlock found on Ethereum and info about finality issues on Eth.
    // if L1 is experiencing finalization problems, returns the latest arbBlock found in the latest L1 block
    const [blockArbFoundOnL1, blockFinalizedEth, finalityIssueFlagEth] = await getBlocksAndCheckFinality(
      providerEth,
      providerArb,
      sequencer,
      maxDelaySeconds
    );

    if (!blockArbFoundOnL1) {
      console.error("Critical Error: Arbitrum block is not found on L1.");
      return;
    }

    // claims can be made for the previous epoch, hence
    // if an epoch is 2 or more epochs behind the L1 finalized epoch, no further claims can be made, we call this 'veaEpochOutboxFinalized'
    const veaEpochOutboxClaimableFinalized = Math.floor(blockFinalizedEth.timestamp / epochPeriod) - 2;

    const timeLocal = Math.floor(Date.now() / 1000);
    const timeEth = finalityIssueFlagEth ? timeLocal : blockFinalizedEth.timestamp;

    // if the sequencer is offline for maxDelaySeconds, the l2 timestamp in the next block is clamp to the current L1 timestamp - maxDelaySeconds
    const l2Time = Math.max(blockArbFoundOnL1.timestamp, blockFinalizedEth.timestamp - maxDelaySeconds);

    // the latest epoch that is finalized from the L2 POV
    // this depends on the L2 clock
    const veaEpochInboxFinalized = Math.floor(l2Time / epochPeriod) - 1;
    const veaEpochOutboxClaimableNowOld = veaEpochOutboxClaimableNow;
    veaEpochOutboxClaimableNow = Math.floor(timeEth / epochPeriod) - 1;
    if (veaEpochOutboxClaimableNow > veaEpochOutboxClaimableNowOld) {
      const veaEpochsOutboxClaimableNew: number[] = new Array(
        veaEpochOutboxClaimableNow - veaEpochOutboxClaimableNowOld
      )
        .fill(veaEpochOutboxClaimableNowOld + 1)
        .map((el, i) => el + i);
      veaEpochOutboxCheckClaimsRangeArray.push(...veaEpochsOutboxClaimableNew);
    }

    if (veaEpochOutboxCheckClaimsRangeArray.length == 0) {
      console.log("no claims to check");
      const timeToNextEpoch = epochPeriod - (Math.floor(Date.now() / 1000) % epochPeriod);
      console.log("waiting till next epoch in " + timeToNextEpoch + " seconds. . .");
      continue;
    }

    for (let index = 0; index < veaEpochOutboxCheckClaimsRangeArray.length; index++) {
      console.log("Checking claim for epoch " + veaEpochOutboxCheckClaimsRangeArray[index]);
      const challenge = challengeTxnHashes.get(index);
      const veaEpochOutboxCheck = veaEpochOutboxCheckClaimsRangeArray[index];

      // if L1 experiences finality failure, we use the latest block
      const blockTagEth = finalityIssueFlagEth ? "latest" : "finalized";
      const claimHash = (await retryOperation(
        () => veaOutbox.claimHashes(veaEpochOutboxCheck, { blockTag: blockTagEth }),
        1000,
        10
      )) as string;

      // no claim
      if (claimHash == "0x0000000000000000000000000000000000000000000000000000000000000000") {
        // if epoch is not claimable anymore, remove from array
        if (veaEpochOutboxCheck <= veaEpochOutboxClaimableFinalized) {
          console.log(
            "no claim for epoch " +
              veaEpochOutboxCheck +
              " and the vea epoch in the outbox is finalized (can no longer be claimed)."
          );
          veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
          index--;
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
        let blockNumberOutboxLowerBound: number;

        // to query event performantly, we limit the block range with the heuristic that. delta blocknumber <= delta timestamp / secondsPerSlot
        if (veaEpochOutboxCheck <= veaEpochOutboxClaimableFinalized) {
          blockNumberOutboxLowerBound =
            blockFinalizedEth.number -
            Math.ceil(((veaEpochOutboxClaimableFinalized - veaEpochOutboxCheck + 2) * epochPeriod) / secondsPerSlotEth);
        } else {
          blockNumberOutboxLowerBound = blockFinalizedEth.number - Math.ceil(epochPeriod / secondsPerSlotEth);
        }

        // get claim data
        const logClaimed = (
          await retryOperation(
            () =>
              veaOutbox.queryFilter(
                veaOutbox.filters.Claimed(null, veaEpochOutboxCheck, null),
                blockNumberOutboxLowerBound,
                blockTagEth
              ),
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
          console.log("!! Claimed merkle root mismatch for epoch " + veaEpochOutboxCheck);

          // if Eth is finalizing but sequencer is malfunctioning, we can wait until the snapshot is considered finalized (L2 time is in the next epoch)
          if (!finalityIssueFlagEth && veaEpochInboxFinalized < veaEpochOutboxCheck) {
            // note as long as L1 does not have finalization probelms, sequencer could still be malfunctioning
            console.log("L2 snapshot is not yet finalized, waiting for finalization to determine challengable status");
          } else {
            const timestampClaimed = (
              (await retryOperation(() => providerEth.getBlock(logClaimed.blockNumber), 1000, 10)) as Block
            ).timestamp;

            /*

              we want to constrcut the struct below from events, since only the hash is stored onchain

              struct Claim {
                bytes32 stateRoot;
                address claimer;
                uint32 timestampClaimed;
                uint32 timestampVerification;
                uint32 blocknumberVerification;
                Party honest;
                address challenger;
              }
              
              */
            var claim = {
              stateRoot: logClaimed.data,
              claimer: "0x" + logClaimed.topics[1].substring(26),
              timestampClaimed: timestampClaimed,
              timestampVerification: 0,
              blocknumberVerification: 0,
              honest: 0,
              challenger: "0x0000000000000000000000000000000000000000",
            };

            // check if the claim is in verification or verified
            const logVerficiationStarted = (await retryOperation(
              () =>
                veaOutbox.queryFilter(
                  veaOutbox.filters.VerificationStarted(veaEpochOutboxCheck),
                  blockNumberOutboxLowerBound,
                  blockTagEth
                ),
              1000,
              10
            )) as Log[];

            if (logVerficiationStarted.length > 0) {
              const timestampVerification = (
                (await retryOperation(
                  () => providerEth.getBlock(logVerficiationStarted[logVerficiationStarted.length - 1].blockNumber),
                  1000,
                  10
                )) as Block
              ).timestamp;

              // Update the claim struct with verification details
              claim.timestampVerification = timestampVerification;
              claim.blocknumberVerification = logVerficiationStarted[logVerficiationStarted.length - 1].blockNumber;

              const claimHashCalculated = hashClaim(claim);

              // The hash should match if there is no challenge made and no honest party yet
              if (claimHashCalculated != claimHash) {
                // Either challenge is made or honest party is set with or without a challenge
                claim.honest = 1;
                const claimerHonestHash = hashClaim(claim);
                if (claimerHonestHash == claimHash) {
                  console.log("Claim is honest for epoch " + veaEpochOutboxCheck);
                  // As the claim is honest, remove the epoch from the local array
                  veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
                  challengeTxnHashes.delete(index);
                  continue;
                }
                // The claim is challenged and anyone can be the honest party
              }
            }

            const logChallenges = (await retryOperation(
              () =>
                veaOutbox.queryFilter(
                  veaOutbox.filters.Challenged(veaEpochOutboxCheck, null),
                  blockNumberOutboxLowerBound,
                  blockTagEth
                ),
              1000,
              10
            )) as Log[];

            // if not challenged, keep checking all claim struct variables
            if (logChallenges.length == 0 && challengeTxnHashes[index] == undefined) {
              console.log("Claim is challengeable for epoch " + veaEpochOutboxCheck);
            } else if (logChallenges.length > 0) {
              // Claim is challenged, we check if the snapShot is sent and if the dispute is resolved
              console.log("Claim is already challenged for epoch " + veaEpochOutboxCheck);
              claim.challenger = "0x" + logChallenges[0].topics[2].substring(26);

              // if claim hash with challenger as winner matches the claimHash, then the challenge is over and challenger won
              const challengerWinClaim = { ...claim };
              challengerWinClaim.honest = 2; // challenger wins

              const claimerWinClaim = { ...claim };
              claimerWinClaim.honest = 1; // claimer wins
              if (hashClaim(challengerWinClaim) == claimHash) {
                // The challenge is over and challenger won
                console.log("Challenger won the challenge for epoch " + veaEpochOutboxCheck);
                const withdrawChlngDepositTxn = (await retryOperation(
                  () => veaOutbox.withdrawChallengeDeposit(veaEpochOutboxCheck, challengerWinClaim),
                  1000,
                  10
                )) as ContractTransactionResponse;
                console.log(
                  "Deposit withdrawn by challenger for " +
                    veaEpochOutboxCheck +
                    " with txn hash " +
                    withdrawChlngDepositTxn.hash
                );
                // As the challenge is over, remove the epoch from the local array
                veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
                challengeTxnHashes.delete(index);
                continue;
              } else if (hashClaim(claimerWinClaim) == claimHash) {
                // The challenge is over and claimer won
                console.log("Claimer won the challenge for epoch " + veaEpochOutboxCheck);
                veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
                challengeTxnHashes.delete(index);
                continue;
              }

              // Claim is challenged, no honest party yet
              if (logChallenges[0].blockNumber < blockFinalizedEth.number) {
                // Send the "stateRoot" snapshot from Arbitrum to the Eth inbox if not sent already
                const claimTimestamp = veaEpochOutboxCheckClaimsRangeArray[index] * epochPeriod;

                let blockLatestArb = (await retryOperation(() => providerArb.getBlock("latest"), 1000, 10)) as Block;
                let blockoldArb = (await retryOperation(
                  () => providerArb.getBlock(blockLatestArb.number - 100),
                  1000,
                  10
                )) as Block;

                const arbAverageBlockTime = (blockLatestArb.timestamp - blockoldArb.timestamp) / 100;

                const fromClaimEpochBlock = Math.ceil(
                  blockLatestArb.number - (blockLatestArb.timestamp - claimTimestamp) / arbAverageBlockTime
                );

                const sendSnapshotLogs = (await retryOperation(
                  () =>
                    veaInbox.queryFilter(
                      veaInbox.filters.SnapshotSent(veaEpochOutboxCheck, null),
                      fromClaimEpochBlock,
                      blockTagEth
                    ),
                  1000,
                  10
                )) as Log[];
                if (sendSnapshotLogs.length == 0) {
                  // No snapshot sent so, send snapshot
                  try {
                    const gasEstimate = await retryOperation(
                      () => veaInbox.sendSnapshot.estimateGas(veaEpochOutboxCheck, claim),
                      1000,
                      10
                    );

                    const txnSendSnapshot = (await retryOperation(
                      () =>
                        veaInbox["sendSnapshot(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
                          veaEpochOutboxCheck,
                          claim, // the claim struct has to be updated with the correct challenger
                          {
                            gasLimit: gasEstimate,
                          }
                        ),
                      1000,
                      10
                    )) as ContractTransactionResponse;
                    console.log(
                      "Snapshot message sent for epoch " +
                        veaEpochOutboxCheck +
                        " with txn hash " +
                        txnSendSnapshot.hash
                    );
                  } catch (error) {
                    console.error("Error sending snapshot for epoch " + veaEpochOutboxCheck + " with error " + error);
                  }
                } else {
                  // snapshot already sent, check if the snapshot can be relayed to veaOutbox
                  console.log("Snapshot already sent for epoch " + veaEpochOutboxCheck);
                  const msgStatus = await getMessageStatus(
                    sendSnapshotLogs[0].transactionHash,
                    process.env.RPC_ARB,
                    process.env.RPC_ETH
                  );
                  if (msgStatus === 1) {
                    // msg waiting for execution
                    const msgExecuteTrnx = await messageExecutor(
                      sendSnapshotLogs[0].transactionHash,
                      process.env.RPC_ARB,
                      process.env.RPC_ETH
                    );
                    if (msgExecuteTrnx) {
                      // msg executed successfully
                      console.log("Snapshot message relayed to veaOutbox for epoch " + veaEpochOutboxCheck);
                      veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
                      challengeTxnHashes.delete(index);
                    } else {
                      // msg failed to execute
                      console.error("Error sending snapshot to veaOutbox for epoch " + veaEpochOutboxCheck);
                    }
                  }
                }
                continue;
              }
              continue;
            }

            if (challengeTxnHashes[index] != undefined) {
              const txnReceipt = (await retryOperation(
                () => providerEth.getTransactionReceipt(challengeTxnHashes[index]),
                10,
                1000
              )) as TransactionReceipt;
              if (!txnReceipt) {
                console.log("challenge txn " + challenge[index] + " not mined yet");
                continue;
              }
              const blockNumber = txnReceipt.blockNumber;
              const challengeBlock = (await retryOperation(() => providerEth.getBlock(blockNumber), 1000, 10)) as Block;
              if (challengeBlock.number < blockFinalizedEth.number) {
                veaEpochOutboxCheckClaimsRangeArray.splice(index, 1);
                index--;
                challengeTxnHashes.delete(index);
                // the challenge is finalized, no further action needed
                console.log("challenge is finalized");
                continue;
              }
            }
            const gasEstimate = BigInt(
              (await retryOperation(
                () =>
                  veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"].estimateGas(
                    veaEpochOutboxCheck,
                    claim,
                    { value: deposit }
                  ),
                1000,
                10
              )) as any
            );

            // Adjust the calculation to ensure maxFeePerGas is reasonable
            const maxFeePerGasProfitable = deposit / (gasEstimate * BigInt(6));

            // Set a reasonable maxPriorityFeePerGas but ensure it's lower than maxFeePerGas
            let maxPriorityFeePerGasMEV = BigInt(6667000000000); // 6667 gwei
            console.log("Transaction Challenge Gas Estimate", gasEstimate.toString());

            // Ensure maxPriorityFeePerGas <= maxFeePerGas
            if (maxPriorityFeePerGasMEV > maxFeePerGasProfitable) {
              console.warn(
                "maxPriorityFeePerGas is higher than maxFeePerGasProfitable, adjusting maxPriorityFeePerGas"
              );
              maxPriorityFeePerGasMEV = maxFeePerGasProfitable; // adjust to be equal or less
            }
            try {
              const txnChallenge = (await retryOperation(
                () =>
                  veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
                    veaEpochOutboxCheck,
                    claim,
                    {
                      maxFeePerGas: maxFeePerGasProfitable,
                      maxPriorityFeePerGas: maxPriorityFeePerGasMEV,
                      value: deposit,
                      gasLimit: gasEstimate,
                    }
                  ),
                1000,
                10
              )) as ContractTransactionResponse;
              // Make wait for receipt and check if the challenge is finalized
              console.log("Transaction Challenge Hash", txnChallenge.hash);
              // Update local var with the challenge txn hash
              challengeTxnHashes.set(index, txnChallenge.hash);
              console.log("challenging claim for epoch " + veaEpochOutboxCheck + " with txn hash " + txnChallenge.hash);
            } catch (error) {
              console.error("Error challenging claim for epoch " + veaEpochOutboxCheck + " with error " + error);
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
  ArbProvider: JsonRpcProvider,
  sequencer: SequencerInbox,
  maxDelaySeconds: number
): Promise<[Block, Block, Boolean] | undefined> => {
  const blockFinalizedArb = (await retryOperation(() => ArbProvider.getBlock("finalized"), 1000, 10)) as Block;
  const blockFinalizedEth = (await retryOperation(() => EthProvider.getBlock("finalized"), 1000, 10)) as Block;

  const finalityBuffer = 300; // 5 minutes, allows for network delays
  const maxFinalityTimeSecondsEth = (slotsPerEpochEth * 3 - 1) * secondsPerSlotEth; // finalization after 2 justified epochs

  let finalityIssueFlagArb = false;
  let finalityIssueFlagEth = false;

  // check latest arb block to see if there are any sequencer issues
  let blockLatestArb = (await retryOperation(() => ArbProvider.getBlock("latest"), 1000, 10)) as Block;

  const maxDelayInSeconds = 7 * 24 * 60 * 60; // 7 days
  let blockoldArb = (await retryOperation(() => ArbProvider.getBlock(blockLatestArb.number - 100), 1000, 10)) as Block;
  const arbAverageBlockTime = (blockLatestArb.timestamp - blockoldArb.timestamp) / 100;
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

  if (blockFinalizedEth.number < blockFinalizedArbToL1Block[0].number) {
    console.error(
      "Arbitrum 'finalized' block is posted in an L1 block which is not finalized. Arbitrum node is out of sync with L1 node. It's recommended to use the same L1 RPC as the L1 node used by the Arbitrum node."
    );
    finalityIssueFlagArb = true;
  }

  // if L1 is experiencing finalization problems, we use the latest L2 block
  // we could
  const blockArbitrum = finalityIssueFlagArb || finalityIssueFlagEth ? blockLatestArb : blockFinalizedArb;

  return [blockArbitrum, blockFinalizedEth, finalityIssueFlagEth];
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
    .catch((e) => {
      // If the L2Block is the latest ArbBlock this will always throw an error
      console.log("Error finding batch containing block, searching heuristically...");
    })) as any;

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
  const result = (await nodeInterface.functions.findBatchContainingBlock(high, { blockTag: "latest" })) as any;
  return [result.batch.toNumber(), high];
};

const hashClaim = (claim): any => {
  return ethers.solidityPackedKeccak256(
    ["bytes32", "address", "uint32", "uint32", "uint32", "uint8", "address"],
    [
      claim.stateRoot,
      claim.claimer,
      claim.timestampClaimed,
      claim.timestampVerification,
      claim.blocknumberVerification,
      claim.honest,
      claim.challenger,
    ]
  );
};

(async () => {
  await watch();
})();
export default watch;
