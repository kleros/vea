import { EventEmitter } from "events";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { getClaim } from "../utils/claim";
import { getLastClaimedEpoch } from "../utils/graphQueries";
import { ArbToEthTransactionHandler } from "./transactionHandler";
import { BotEvents } from "../utils/botEvents";
interface checkAndClaimParams {
  epochPeriod: number;
  epoch: number;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutbox: any;
  veaOutboxProvider: JsonRpcProvider;
  transactionHandler: ArbToEthTransactionHandler | null;
  emitter: EventEmitter;
}

export async function checkAndClaim({
  epoch,
  epochPeriod,
  veaInbox,
  veaInboxProvider,
  veaOutbox,
  veaOutboxProvider,
  transactionHandler,
  emitter,
}: checkAndClaimParams) {
  let outboxStateRoot = await veaOutbox.stateRoot();
  const finalizedOutboxBlock = await veaOutboxProvider.getBlock("finalized");
  const claimAbleEpoch = finalizedOutboxBlock.timestamp / epochPeriod;
  const claim = await getClaim(veaOutbox, veaOutboxProvider, epoch, finalizedOutboxBlock.number, "finalized");
  if (claim == null && epoch == claimAbleEpoch) {
    const savedSnapshot = await veaInbox.snapshots(epoch);
    if (savedSnapshot != outboxStateRoot && savedSnapshot != ethers.ZeroHash) {
      const claimData = await getLastClaimedEpoch();
      if (claimData.challenged || claimData.stateroot != savedSnapshot) {
        if (!transactionHandler) {
          transactionHandler = new ArbToEthTransactionHandler(
            epoch,
            veaInbox,
            veaOutbox,
            veaInboxProvider,
            veaOutboxProvider,
            emitter,
            claim
          );
        }
        await transactionHandler.makeClaim(savedSnapshot);
      }
    }
    return null;
  } else if (claim != null) {
    if (!transactionHandler) {
      transactionHandler = new ArbToEthTransactionHandler(
        epoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        emitter,
        claim
      );
    } else {
      transactionHandler.claim = claim;
    }
    if (claim.honest == 1) {
      await transactionHandler.withdrawClaimDeposit();
    } else if (claim.honest == 0) {
      if (claim.timestampVerification == 0) {
        await transactionHandler.startVerification();
      } else {
        await transactionHandler.verifySnapshot();
      }
    }
  } else {
    emitter.emit(BotEvents.CLAIM_EPOCH_PASSED, epoch);
  }
  if (transactionHandler) return transactionHandler;
  return null;
}
