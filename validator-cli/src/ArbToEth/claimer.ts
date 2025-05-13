import { EventEmitter } from "events";
import { ethers } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getClaim, ClaimHonestState } from "../utils/claim";
import { getLastClaimedEpoch } from "../utils/graphQueries";
import { ArbToEthTransactionHandler } from "./transactionHandler";
import { BotEvents } from "../utils/botEvents";
import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { ArbToEthDevnetTransactionHandler } from "./transactionHandlerDevnet";
import { getTransactionHandler } from "../utils/ethers";
import { Network } from "../consts/bridgeRoutes";
interface CheckAndClaimParams {
  chainId: number;
  network: Network;
  claim: ClaimStruct | null;
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
  fetchTransactionHandler?: typeof getTransactionHandler;
  now?: number;
}

async function checkAndClaim({
  chainId,
  network,
  claim,
  epoch,
  epochPeriod,
  veaInbox,
  veaInboxProvider,
  veaOutbox,
  veaOutboxProvider,
  transactionHandler,
  emitter,
  fetchLatestClaimedEpoch = getLastClaimedEpoch,
  fetchTransactionHandler = getTransactionHandler,
  now = Date.now(),
}: CheckAndClaimParams) {
  let outboxStateRoot = await veaOutbox.stateRoot();
  const claimAbleEpoch = Math.floor(now / (1000 * epochPeriod)) - 1;
  if (!transactionHandler) {
    const TransactionHandler = fetchTransactionHandler(chainId, network);
    transactionHandler = new TransactionHandler({
      network,
      epoch,
      veaInbox,
      veaOutbox,
      veaInboxProvider,
      veaOutboxProvider,
      emitter,
      claim,
    });
  } else {
    transactionHandler.claim = claim;
  }

  if (network == Network.DEVNET) {
    return makeClaimDevnet(
      epoch,
      claim,
      outboxStateRoot,
      transactionHandler as ArbToEthDevnetTransactionHandler,
      veaInbox,
      emitter
    );
  } else if (claim == null && epoch == claimAbleEpoch) {
    return makeClaim(epoch, transactionHandler, outboxStateRoot, veaInbox, veaOutbox, fetchLatestClaimedEpoch);
  } else if (claim != null) {
    return verifyClaim(transactionHandler, claim, veaOutboxProvider);
  } else {
    emitter.emit(BotEvents.CLAIM_EPOCH_PASSED, epoch);
  }
  return null;
}

async function makeClaimDevnet(
  epoch: number,
  claim: ClaimStruct | null,
  outboxStateRoot: string,
  transactionHandler: ArbToEthDevnetTransactionHandler,
  veaInbox: any,
  emitter: EventEmitter
): Promise<ArbToEthDevnetTransactionHandler | null> {
  if (claim == null) {
    const [savedSnapshot] = await Promise.all([veaInbox.snapshots(epoch)]);

    const newMessagesToBridge = savedSnapshot != outboxStateRoot && savedSnapshot != ethers.ZeroHash;
    if (newMessagesToBridge && savedSnapshot != ethers.ZeroHash) {
      await transactionHandler.devnetAdvanceState(savedSnapshot);
      return transactionHandler;
    }
  }
  emitter.emit(BotEvents.NO_CLAIM_REQUIRED, epoch);
  return null;
}

async function makeClaim(
  epoch: number,
  transactionHandler: ArbToEthTransactionHandler,
  outboxStateRoot: string,
  veaInbox: any,
  veaOutbox: any,
  fetchLatestClaimedEpoch: typeof getLastClaimedEpoch = getLastClaimedEpoch
): Promise<ArbToEthTransactionHandler | null> {
  const [savedSnapshot, claimData] = await Promise.all([
    veaInbox.snapshots(epoch),
    fetchLatestClaimedEpoch(veaOutbox.target),
  ]);
  const newMessagesToBridge = savedSnapshot != outboxStateRoot && savedSnapshot != ethers.ZeroHash;
  const lastClaimChallenged = claimData?.challenged && savedSnapshot == outboxStateRoot;
  if ((newMessagesToBridge || lastClaimChallenged) && savedSnapshot != ethers.ZeroHash) {
    await transactionHandler.makeClaim(savedSnapshot);
    return transactionHandler;
  }
}

async function verifyClaim(
  transactionHandler: ArbToEthTransactionHandler,
  claim: ClaimStruct,
  veaOutboxProvider: JsonRpcProvider
) {
  if (claim.honest == ClaimHonestState.CLAIMER) {
    await transactionHandler.withdrawClaimDeposit();
    return transactionHandler;
  } else if (claim.honest == ClaimHonestState.NONE) {
    const finalizedOutboxBlock = await veaOutboxProvider.getBlock("finalized");
    if (claim.challenger != ethers.ZeroAddress) {
      return transactionHandler;
    }
    if (claim.timestampVerification == 0) {
      await transactionHandler.startVerification(finalizedOutboxBlock.timestamp);
    } else {
      await transactionHandler.verifySnapshot(finalizedOutboxBlock.timestamp);
    }
    return transactionHandler;
  }
}

export { checkAndClaim, CheckAndClaimParams };
