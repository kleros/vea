require("dotenv").config();
import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { getClaimForEpoch, ClaimData, getLastClaimedEpoch } from "utils/graphQueries";
import { getVeaInbox, getVeaOutboxDevnet } from "utils/ethers";
import { getBridgeConfig } from "consts/bridgeRoutes";

const watch = async () => {
  const chainId = Number(process.env.VEAOUTBOX_CHAIN_ID);
  const bridgeConfig = getBridgeConfig(chainId);
  const veaInboxAddress = process.env.VEAINBOX_ADDRESS;
  const veaInboxProviderURL = process.env.VEAINBOX_PROVIDER;
  const veaOutboxAddress = process.env.VEAOUTBOX_ADDRESS;
  const veaOutboxProviderURL = process.env.VEAOUTBOX_PROVIDER;
  const veaOutboxJSON = new JsonRpcProvider(veaOutboxProviderURL);
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  const veaInbox = getVeaInbox(veaInboxAddress, PRIVATE_KEY, veaInboxProviderURL, chainId);
  const veaOutbox = getVeaOutboxDevnet(veaOutboxAddress, PRIVATE_KEY, veaOutboxProviderURL, chainId);

  // Check if the current epoch is claimed on veaOutbox
  const currentEpoch = Math.floor(Date.now() / 1000 / bridgeConfig.epochPeriod);
  const epochs: number[] = new Array(24).fill(currentEpoch - 24).map((el, i) => el + i);
  let verifiableEpoch = currentEpoch - 1;

  while (true) {
    let i = 0;
    while (i < epochs.length) {
      const activeEpoch = epochs[i];
      console.log("Checking for epoch " + activeEpoch);
      let claimableEpochHash = await veaOutbox.claimHashes(activeEpoch);
      let outboxStateRoot = await veaOutbox.stateRoot();
      const finalizedOutboxBlock = await veaOutboxJSON.getBlock("finalized");

      if (claimableEpochHash == ethers.constants.HashZero && activeEpoch == verifiableEpoch) {
        // Claim can be made
        const savedSnapshot = await veaInbox.snapshots(activeEpoch);
        if (savedSnapshot != outboxStateRoot && savedSnapshot != ethers.constants.HashZero) {
          // Its possible that a claim was made for previous epoch but its not verified yet
          // Making claim if there are new messages or last claim was challenged.
          const claimData = await getLastClaimedEpoch(chainId);

          if (claimData.challenged || claimData.stateroot != savedSnapshot) {
            // Making claim as either last claim was challenged or there are new messages

            const gasEstimate = await veaOutbox.estimateGas.claim(activeEpoch, savedSnapshot, {
              value: bridgeConfig.deposit,
            });

            const claimTransaction = await veaOutbox.claim(activeEpoch, savedSnapshot, {
              value: bridgeConfig.deposit,
              gasLimit: gasEstimate,
            });
            console.log(`Epoch ${activeEpoch} was claimed with trnx hash ${claimTransaction.hash}`);
          } else {
            console.log("No new messages, no need for a claim");
            epochs.splice(i, 1);
            i--;
            continue;
          }
        } else {
          if (savedSnapshot == ethers.constants.HashZero) {
            console.log("No snapshot saved for epoch " + activeEpoch);
          } else {
            console.log("No new messages after last claim");
          }
          epochs.splice(i, 1);
          i--;
        }
      } else if (claimableEpochHash != ethers.constants.HashZero) {
        console.log("Claim is already made, checking for verification stage");
        const claimData: ClaimData = await getClaimForEpoch(chainId, activeEpoch);
        if (claimData == undefined) {
          console.log(`Claim data not found for ${activeEpoch}, skipping for now`);
          continue;
        }
        var claim = {
          stateRoot: claimData.stateroot,
          claimer: claimData.bridger,
          timestampClaimed: claimData.timestamp,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 0,
          challenger: "0x0000000000000000000000000000000000000000",
        };
        const claimTransaction = await veaOutboxJSON.getTransaction(claimData.txHash);

        // ToDo: Update subgraph to get verification start data
        const verifiactionLogs = await veaOutboxJSON.getLogs({
          address: veaOutboxAddress,
          topics: veaOutbox.filters.VerificationStarted(activeEpoch).topics,
          fromBlock: claimTransaction.blockNumber,
          toBlock: "latest",
        });

        if (verifiactionLogs.length > 0) {
          // Verification started update the claim struct
          const verificationStartBlock = await veaOutboxJSON.getBlock(verifiactionLogs[0].blockHash);
          claim.timestampVerification = verificationStartBlock.timestamp;
          claim.blocknumberVerification = verificationStartBlock.number;

          // Check if the verification is already resolved
          if (hashClaim(claim) == claimableEpochHash) {
            // Claim not resolved yet, check if we can verifySnapshot
            if (finalizedOutboxBlock.timestamp - claim.timestampVerification > bridgeConfig.minChallengePeriod) {
              console.log("Verification period passed, verifying snapshot");
              // Estimate gas for verifySnapshot
              const verifySnapshotTxn = await veaOutbox.verifySnapshot(activeEpoch, claim);
              console.log(`Verified snapshot for epoch ${activeEpoch} with trnx hash ${verifySnapshotTxn.hash}`);
            } else {
              console.log(
                "Censorship test in progress, sec left: " +
                  -1 * (finalizedOutboxBlock.timestamp - claim.timestampVerification - bridgeConfig.minChallengePeriod)
              );
            }
          } else {
            // Claim is already verified, withdraw deposit
            claim.honest = 1; // Assume the claimer is honest
            if (hashClaim(claim) == claimableEpochHash) {
              const withdrawDepositTxn = await veaOutbox.withdrawClaimDeposit(activeEpoch, claim);
              console.log(`Withdrew deposit for epoch ${activeEpoch} with trnx hash ${withdrawDepositTxn.hash}`);
            } else {
              console.log("Challenger won claim");
            }
            epochs.splice(i, 1);
            i--;
          }
        } else {
          console.log("Verification not started yet");
          // No verification started yet, check if we can start it
          if (
            finalizedOutboxBlock.timestamp - claim.timestampClaimed >
            bridgeConfig.sequencerDelayLimit + bridgeConfig.epochPeriod
          ) {
            const startVerifTrx = await veaOutbox.startVerification(activeEpoch, claim);
            console.log(`Verification started for epoch ${activeEpoch} with trx hash ${startVerifTrx.hash}`);
            // Update local struct for trnx hash and block number as it takes time for the trnx to be mined.
          } else {
            const timeLeft =
              finalizedOutboxBlock.timestamp -
              claim.timestampClaimed -
              bridgeConfig.sequencerDelayLimit -
              bridgeConfig.epochPeriod;
            console.log("Sequencer delay not passed yet, seconds left: " + -1 * timeLeft);
          }
        }
      } else {
        epochs.splice(i, 1);
        i--;
        console.log("Epoch has passed: " + activeEpoch);
      }
      i++;
    }
    if (Math.floor(Date.now() / 1000 / bridgeConfig.epochPeriod) - 1 > verifiableEpoch) {
      verifiableEpoch = Math.floor(Date.now() / 1000 / bridgeConfig.epochPeriod) - 1;
      epochs.push(verifiableEpoch);
    }
    console.log("Waiting for next verifiable epoch after " + verifiableEpoch);
    await wait(1000 * 10);
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const hashClaim = (claim) => {
  return ethers.utils.solidityKeccak256(
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

watch();
