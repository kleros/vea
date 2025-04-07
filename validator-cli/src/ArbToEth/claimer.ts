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
  const finalizedOutboxBlock = await veaOutboxProvider.getBlock("finalized");
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
  var savedSnapshot;
  var claimData;
  var newMessagesToBridge: boolean;
  var lastClaimChallenged: boolean;

  if (network == Network.DEVNET) {
    const devnetTransactionHandler = transactionHandler as ArbToEthDevnetTransactionHandler;
    if (claim == null) {
      [savedSnapshot, claimData] = await Promise.all([
        veaInbox.snapshots(epoch),
        fetchLatestClaimedEpoch(veaOutbox.target),
      ]);

      newMessagesToBridge = savedSnapshot != outboxStateRoot && savedSnapshot != ethers.ZeroHash;
      if (newMessagesToBridge && savedSnapshot != ethers.ZeroHash) {
        await devnetTransactionHandler.devnetAdvanceState(savedSnapshot);
        return devnetTransactionHandler;
      }
    }
  } else if (claim == null && epoch == claimAbleEpoch) {
    [savedSnapshot, claimData] = await Promise.all([
      veaInbox.snapshots(epoch),
      fetchLatestClaimedEpoch(veaOutbox.target),
    ]);
    newMessagesToBridge = savedSnapshot != outboxStateRoot && savedSnapshot != ethers.ZeroHash;
    lastClaimChallenged = claimData?.challenged && savedSnapshot == outboxStateRoot;
    if ((newMessagesToBridge || lastClaimChallenged) && savedSnapshot != ethers.ZeroHash) {
      await transactionHandler.makeClaim(savedSnapshot);
      return transactionHandler;
    }
    emitter.emit(BotEvents.NO_CLAIM_REQUIRED, epoch);
  } else if (claim != null) {
    if (claim.honest == ClaimHonestState.CLAIMER) {
      await transactionHandler.withdrawClaimDeposit();
      return transactionHandler;
    } else if (claim.honest == ClaimHonestState.NONE) {
      if (claim.challenger != ethers.ZeroAddress) {
        emitter.emit(BotEvents.CLAIM_CHALLENGED, epoch);
        return transactionHandler;
      }
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

export { checkAndClaim, CheckAndClaimParams };
