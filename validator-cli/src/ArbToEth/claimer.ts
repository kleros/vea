import { EventEmitter } from "events";
import { ethers } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getClaim, ClaimHonestState } from "../utils/claim";
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
  fetchClaim?: typeof getClaim;
  fetchLatestClaimedEpoch?: typeof getLastClaimedEpoch;
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
  fetchClaim = getClaim,
  fetchLatestClaimedEpoch = getLastClaimedEpoch,
}: checkAndClaimParams) {
  let outboxStateRoot = await veaOutbox.stateRoot();
  const finalizedOutboxBlock = await veaOutboxProvider.getBlock("finalized");
  const claimAbleEpoch = finalizedOutboxBlock.timestamp / epochPeriod;
  const claim = await fetchClaim(veaOutbox, veaOutboxProvider, epoch, finalizedOutboxBlock.number, "finalized");
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
  if (claim == null && epoch == claimAbleEpoch) {
    const [savedSnapshot, claimData] = await Promise.all([veaInbox.snapshots(epoch), fetchLatestClaimedEpoch()]);
    const newMessagesToBridge: boolean = savedSnapshot != outboxStateRoot && savedSnapshot != ethers.ZeroHash;
    const lastClaimChallenged: boolean = claimData.challenged && savedSnapshot == outboxStateRoot;

    if (newMessagesToBridge || lastClaimChallenged) {
      await transactionHandler.makeClaim(savedSnapshot);
      return transactionHandler;
    }
  } else if (claim != null) {
    if (claim.honest == ClaimHonestState.CLAIMER) {
      await transactionHandler.withdrawClaimDeposit();
      return transactionHandler;
    } else if (claim.honest == ClaimHonestState.NONE) {
      if (claim.timestampVerification == 0) {
        await transactionHandler.startVerification(finalizedOutboxBlock.timestamp);
      } else {
        await transactionHandler.verifySnapshot(finalizedOutboxBlock.timestamp);
      }
      return transactionHandler;
    }
  } else {
    emitter.emit(BotEvents.CLAIM_EPOCH_PASSED, epoch);
  }
  return null;
}
