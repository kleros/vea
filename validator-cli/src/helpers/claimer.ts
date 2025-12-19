import { EventEmitter } from "events";
import { ethers } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getClaim, ClaimHonestState } from "../utils/claim";
import { getLastClaimedEpoch } from "../utils/graphQueries";
import { BotEvents } from "../utils/botEvents";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { ITransactionHandler, IDevnetTransactionHandler, getTransactionHandler } from "../utils/transactionHandlers";
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
  transactionHandler: ITransactionHandler | null;
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
  fetchTransactionHandler = getTransactionHandler,
  now = Date.now(),
}: CheckAndClaimParams) {
  let outboxStateRoot = await veaOutbox.stateRoot();
  const claimAbleEpoch = Math.floor(now / (1000 * epochPeriod)) - 1;
  if (!transactionHandler) {
    const TransactionHandler = fetchTransactionHandler(chainId, network);
    transactionHandler = new TransactionHandler({
      chainId,
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
      transactionHandler as IDevnetTransactionHandler,
      veaInbox,
      emitter
    );
  } else if (claim == null && epoch == claimAbleEpoch) {
    return makeClaim(epoch, transactionHandler, outboxStateRoot, veaInbox);
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
  transactionHandler: IDevnetTransactionHandler,
  veaInbox: any,
  emitter: EventEmitter
): Promise<IDevnetTransactionHandler | null> {
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
  transactionHandler: ITransactionHandler,
  outboxStateRoot: string,
  veaInbox: any
): Promise<ITransactionHandler | null> {
  const savedSnapshot = await veaInbox.snapshots(epoch);
  const newMessagesToBridge = savedSnapshot != outboxStateRoot && savedSnapshot != ethers.ZeroHash;
  if (newMessagesToBridge && savedSnapshot != ethers.ZeroHash) {
    await transactionHandler.makeClaim(savedSnapshot);
    return transactionHandler;
  }
}

async function verifyClaim(
  transactionHandler: ITransactionHandler,
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
