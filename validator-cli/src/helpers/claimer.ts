import { EventEmitter } from "events";
import { ethers } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getClaim, ClaimHonestState } from "../utils/claim";
import { getBlocksAndCheckFinality, resolveSettledReadBlocks } from "../utils/arbToEthState";
import { getLastClaimedEpoch } from "../utils/graphQueries";
import { BotEvents } from "../utils/botEvents";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { ITransactionHandler, IDevnetTransactionHandler, getTransactionHandler } from "../utils/transactionHandlers";
import { Network } from "../consts/bridgeRoutes";
import { getLookbackFloorBlock } from "../utils/epochHandler";
import { findLatestLog } from "../utils/logScanner";
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
  veaRouterProvider?: JsonRpcProvider;
  transactionHandler: ITransactionHandler | null;
  emitter: EventEmitter;
  fetchClaim?: typeof getClaim;
  fetchLatestClaimedEpoch?: typeof getLastClaimedEpoch;
  fetchTransactionHandler?: typeof getTransactionHandler;
  fetchBlocksAndCheckFinality?: typeof getBlocksAndCheckFinality;
  fetchSettledReadBlocks?: typeof resolveSettledReadBlocks;
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
  veaRouterProvider,
  fetchLatestClaimedEpoch = getLastClaimedEpoch,
  fetchTransactionHandler = getTransactionHandler,
  fetchBlocksAndCheckFinality = getBlocksAndCheckFinality,
  fetchSettledReadBlocks = resolveSettledReadBlocks,
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
    const queryRpc = veaRouterProvider ?? veaOutboxProvider;
    return makeClaim(
      chainId,
      epoch,
      epochPeriod,
      transactionHandler,
      veaInbox,
      veaOutbox,
      queryRpc,
      emitter,
      fetchLatestClaimedEpoch,
      fetchBlocksAndCheckFinality,
      fetchSettledReadBlocks
    );
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
  chainId: number,
  epoch: number,
  epochPeriod: number,
  transactionHandler: ITransactionHandler,
  veaInbox: any,
  veaOutbox: any,
  queryRpc: JsonRpcProvider,
  emitter: EventEmitter,
  fetchLatestClaimedEpoch: typeof getLastClaimedEpoch = getLastClaimedEpoch,
  fetchBlocksAndCheckFinality: typeof getBlocksAndCheckFinality,
  fetchSettledReadBlocks: typeof resolveSettledReadBlocks = resolveSettledReadBlocks
): Promise<ITransactionHandler | null> {
  // Claiming stakes a deposit on the snapshot we are about to read, so resolve
  // the settled blocks first and read only at them.
  const settledBlocks = await fetchSettledReadBlocks({
    inboxProvider: transactionHandler.veaInboxProvider,
    outboxProvider: queryRpc,
    epoch,
    epochPeriod,
    emitter: emitter as any,
    fetchBlocksAndCheckFinality,
  });
  if (!settledBlocks) return null;

  const savedSnapshot = await veaInbox.snapshots(epoch, { blockTag: settledBlocks.inboxBlock });
  if (savedSnapshot == ethers.ZeroHash) {
    return null;
  }
  const outboxStateRoot = await veaOutbox.stateRoot({ blockTag: settledBlocks.outboxBlock });
  let lastClaimedStateroot: string | null = null;
  try {
    const [floorBlock, headBlock] = await Promise.all([
      getLookbackFloorBlock({ provider: queryRpc, chainId, epochPeriod }),
      queryRpc.getBlock("finalized"),
    ]);
    const lastClaimLog = await findLatestLog({
      contract: veaOutbox,
      filter: veaOutbox.filters.Claimed(),
      fromBlock: floorBlock,
      toBlock: headBlock.number,
    });
    lastClaimedStateroot = lastClaimLog?.data ?? null;
  } catch {
    const claimData = await fetchLatestClaimedEpoch(veaOutbox.target, chainId);
    lastClaimedStateroot = claimData ? claimData.stateRoot : ethers.ZeroHash;
  }
  if (lastClaimedStateroot == null) {
    return null;
  }
  const newMessagesToBridge = savedSnapshot != outboxStateRoot && savedSnapshot != lastClaimedStateroot;
  if (newMessagesToBridge) {
    await transactionHandler.makeClaim(savedSnapshot);
    return transactionHandler;
  }
  return null;
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
