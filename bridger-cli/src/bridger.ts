require("dotenv").config();
import { ethers } from "ethers";
import { EventEmitter } from "events";
import { getLastClaimedEpoch } from "./utils/graphQueries";
import { getVeaInbox, getVeaOutbox } from "./utils/ethers";
import { fetchClaim, hashClaim } from "./utils/claim";
import { TransactionHandler } from "./utils/transactionHandler";
import { setEpochRange, getLatestVerifiableEpoch } from "./utils/epochHandler";
import { ShutdownSignal } from "./utils/shutdown";
import { initialize as initializeLogger } from "./utils/logger";
import { defaultEmitter } from "./utils/emitter";
import { BotEvents } from "./utils/botEvents";

export const watch = async (
  shutDownSignal: ShutdownSignal = new ShutdownSignal(),
  startEpoch: number = 0,
  emitter: EventEmitter = defaultEmitter
) => {
  initializeLogger(emitter);
  emitter.emit(BotEvents.STARTED);
  const chainId = Number(process.env.VEAOUTBOX_CHAIN_ID);
  const veaInboxAddress = process.env.VEAINBOX_ADDRESS;
  const veaInboxProviderURL = process.env.VEAINBOX_PROVIDER;
  const veaOutboxAddress = process.env.VEAOUTBOX_ADDRESS;
  const veaOutboxProviderURL = process.env.VEAOUTBOX_PROVIDER;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const veaInbox = getVeaInbox(veaInboxAddress, PRIVATE_KEY, veaInboxProviderURL, chainId);
  const veaOutbox = getVeaOutbox(veaOutboxAddress, PRIVATE_KEY, veaOutboxProviderURL, chainId);
  const epochs = await setEpochRange(veaOutbox, startEpoch);
  let verifiableEpoch = epochs[epochs.length - 1] - 1;

  const transactionHandlers: { [epoch: number]: TransactionHandler } = {};

  while (!shutDownSignal.getIsShutdownSignal()) {
    let i = 0;
    while (i < epochs.length) {
      const activeEpoch = epochs[i];
      emitter.emit(BotEvents.CHECKING, activeEpoch);
      let claimableEpochHash = await veaOutbox.claimHashes(activeEpoch);
      let outboxStateRoot = await veaOutbox.stateRoot();
      const finalizedOutboxBlock = await veaOutbox.provider.getBlock("finalized");

      if (claimableEpochHash == ethers.constants.HashZero && activeEpoch == verifiableEpoch) {
        // Claim can be made
        const savedSnapshot = await veaInbox.snapshots(activeEpoch);
        if (savedSnapshot != outboxStateRoot && savedSnapshot != ethers.constants.HashZero) {
          // Its possible that a claim was made for previous epoch but its not verified yet
          // Making claim if there are new messages or last claim was challenged.
          const claimData = await getLastClaimedEpoch();

          if (claimData.challenged || claimData.stateroot != savedSnapshot) {
            // Making claim as either last claim was challenged or there are new messages
            if (!transactionHandlers[activeEpoch]) {
              transactionHandlers[activeEpoch] = new TransactionHandler(
                chainId,
                activeEpoch,
                veaOutbox,
                null,
                null,
                emitter
              );
            }
            await transactionHandlers[activeEpoch].makeClaim(savedSnapshot);
          } else {
            emitter.emit(BotEvents.NO_NEW_MESSAGES);
            epochs.splice(i, 1);
            i--;
            continue;
          }
        } else {
          if (savedSnapshot == ethers.constants.HashZero) {
            emitter.emit(BotEvents.NO_SNAPSHOT);
          } else {
            emitter.emit(BotEvents.NO_NEW_MESSAGES);
          }
          epochs.splice(i, 1);
          i--;
        }
      } else if (claimableEpochHash != ethers.constants.HashZero) {
        const claim = await fetchClaim(veaOutbox, activeEpoch);
        if (!transactionHandlers[activeEpoch]) {
          transactionHandlers[activeEpoch] = new TransactionHandler(
            chainId,
            activeEpoch,
            veaOutbox,
            claim,
            null,
            emitter
          );
        } else {
          transactionHandlers[activeEpoch].claim = claim;
        }
        const transactionHandler = transactionHandlers[activeEpoch];
        if (claim.timestampVerification != 0) {
          // Check if the verification is already resolved
          if (hashClaim(claim) == claimableEpochHash) {
            // Claim not resolved yet, try to verify snapshot
            await transactionHandler.verifySnapshot(finalizedOutboxBlock.timestamp);
          } else {
            // Claim is already verified, withdraw deposit
            claim.honest = 1; // Assume the claimer is honest
            if (hashClaim(claim) == claimableEpochHash) {
              await transactionHandler.withdrawClaimDeposit();
            } else {
              emitter.emit(BotEvents.CHALLENGER_WON_CLAIM);
            }
            epochs.splice(i, 1);
            i--;
          }
        } else if (claim.challenger == ethers.constants.AddressZero) {
          // No verification started yet, check if we can start it
          await transactionHandler.startVerification(finalizedOutboxBlock.timestamp);
        } else {
          epochs.splice(i, 1);
          i--;
          emitter.emit(BotEvents.CLAIM_CHALLENGED);
        }
      } else {
        epochs.splice(i, 1);
        i--;
        emitter.emit(BotEvents.EPOCH_PASSED, activeEpoch);
      }
      i++;
    }
    const newEpoch = getLatestVerifiableEpoch(chainId);
    if (newEpoch > verifiableEpoch) {
      epochs.push(newEpoch);
      verifiableEpoch = newEpoch;
    }
    emitter.emit(BotEvents.WAITING, verifiableEpoch);
    await wait(1000 * 10);
  }
  return epochs;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (require.main === module) {
  const shutDownSignal = new ShutdownSignal(false);
  watch(shutDownSignal);
}
