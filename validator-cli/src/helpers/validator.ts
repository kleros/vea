import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { ITransactionHandler } from "../utils/transactionHandlers";
import { getClaim, getClaimResolveState } from "../utils/claim";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
import { getBlocksAndCheckFinality } from "../utils/arbToEthState";
import { Network } from "../consts/bridgeRoutes";
import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { getTransactionHandler } from "../utils/ethers";

// https://github.com/prysmaticlabs/prysm/blob/493905ee9e33a64293b66823e69704f012b39627/config/params/mainnet_config.go#L103
const secondsPerSlotEth = 12;

export interface ChallengeAndResolveClaimParams {
  chainId: number;
  claim: ClaimStruct;
  epoch: number;
  epochPeriod: number;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutboxProvider: JsonRpcProvider;
  veaRouterProvider?: JsonRpcProvider;
  veaOutbox: any;
  transactionHandler: ITransactionHandler | null;
  emitter?: typeof defaultEmitter;
  fetchClaim?: typeof getClaim;
  fetchClaimResolveState?: typeof getClaimResolveState;
  fetchBlocksAndCheckFinality?: typeof getBlocksAndCheckFinality;
  fetchTransactionHandler?: typeof getTransactionHandler;
}

export async function challengeAndResolveClaim({
  chainId,
  claim,
  epoch,
  epochPeriod,
  veaInbox,
  veaInboxProvider,
  veaOutboxProvider,
  veaOutbox,
  transactionHandler,
  emitter = defaultEmitter,
  veaRouterProvider,
  fetchClaimResolveState = getClaimResolveState,
  fetchBlocksAndCheckFinality = getBlocksAndCheckFinality,
  fetchTransactionHandler = getTransactionHandler,
}: ChallengeAndResolveClaimParams): Promise<ITransactionHandler | null> {
  if (!claim) {
    emitter.emit(BotEvents.NO_CLAIM, epoch);
    return null;
  }
  const queryRpc = veaRouterProvider ? veaRouterProvider : veaOutboxProvider;
  const [arbitrumBlock, ethFinalizedBlock, finalityIssueFlagEth] = await fetchBlocksAndCheckFinality(
    queryRpc,
    veaInboxProvider,
    epoch,
    epochPeriod
  );
  let blockNumberOutboxLowerBound: number;
  const epochClaimableFinalized = Math.floor(ethFinalizedBlock.timestamp / epochPeriod) - 2;
  // to query event performantly, we limit the block range with the heuristic that. delta blocknumber <= delta timestamp / secondsPerSlot
  if (epoch <= epochClaimableFinalized) {
    blockNumberOutboxLowerBound =
      ethFinalizedBlock.number - Math.ceil(((epochClaimableFinalized - epoch + 2) * epochPeriod) / secondsPerSlotEth);
  } else {
    blockNumberOutboxLowerBound = ethFinalizedBlock.number - Math.ceil(epochPeriod / secondsPerSlotEth);
  }
  const ethBlockTag = finalityIssueFlagEth ? "finalized" : "latest";
  if (!transactionHandler) {
    const TransactionHandler = fetchTransactionHandler(chainId, Network.TESTNET);
    transactionHandler = new TransactionHandler({
      chainId,
      network: Network.TESTNET, // Hardcoded as TESTNET & MAINNET have same contracts
      epoch,
      veaInbox,
      veaOutbox,
      veaInboxProvider,
      veaOutboxProvider,
      veaRouterProvider,
      emitter: defaultEmitter,
      claim,
    });
  } else {
    transactionHandler.claim = claim;
  }

  const claimSnapshot = await veaInbox.snapshots(epoch, { blockTag: arbitrumBlock.number });
  if (claimSnapshot != claim.stateRoot && claim.challenger == ethers.ZeroAddress) {
    await transactionHandler.challengeClaim();
  } else {
    if (claimSnapshot == claim.stateRoot && claim.challenger == ethers.ZeroAddress) {
      emitter.emit(BotEvents.VALID_CLAIM, epoch);
      return null;
    } else {
      const claimResolveState = await fetchClaimResolveState(
        chainId,
        veaInbox,
        veaInboxProvider,
        queryRpc,
        epoch,
        blockNumberOutboxLowerBound,
        ethBlockTag
      );
      if (!claimResolveState.sendSnapshot.status) {
        await transactionHandler.sendSnapshot();
      } else if (claimResolveState.execution.status == 1) {
        await transactionHandler.resolveChallengedClaim(claimResolveState.sendSnapshot.txHash);
      } else if (claimResolveState.execution.status == 2) {
        await transactionHandler.withdrawChallengeDeposit();
      } else {
        emitter.emit(BotEvents.WAITING_ARB_TIMEOUT, epoch);
      }
    }
  }

  return transactionHandler;
}
