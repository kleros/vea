import { VeaInboxArbToEth, VeaOutboxArbToEth } from "@kleros/vea-contracts/typechain-types";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import { ArbToEthTransactionHandler } from "./transactionHandler";
import { getClaim, getClaimResolveState } from "../utils/claim";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
import { getBlocksAndCheckFinality } from "../utils/arbToEthState";

// https://github.com/prysmaticlabs/prysm/blob/493905ee9e33a64293b66823e69704f012b39627/config/params/mainnet_config.go#L103
const secondsPerSlotEth = 12;

export interface ChallengeAndResolveClaimParams {
  epoch: number;
  epochPeriod: number;
  veaInbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutboxProvider: JsonRpcProvider;
  veaOutbox: any;
  transactionHandler: ArbToEthTransactionHandler | null;
  emitter?: typeof defaultEmitter;
  fetchClaim?: typeof getClaim;
  fetchClaimResolveState?: typeof getClaimResolveState;
  fetchBlocksAndCheckFinality?: typeof getBlocksAndCheckFinality;
}

export async function challengeAndResolveClaim({
  epoch,
  epochPeriod,
  veaInbox,
  veaInboxProvider,
  veaOutboxProvider,
  veaOutbox,
  transactionHandler,
  emitter = defaultEmitter,
  fetchClaim = getClaim,
  fetchClaimResolveState = getClaimResolveState,
  fetchBlocksAndCheckFinality = getBlocksAndCheckFinality,
}: ChallengeAndResolveClaimParams): Promise<ArbToEthTransactionHandler | null> {
  const [arbitrumBlock, ethFinalizedBlock, finalityIssueFlagEth] = await fetchBlocksAndCheckFinality(
    veaOutboxProvider,
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
  const claim = await fetchClaim(veaOutbox, veaOutboxProvider, epoch, blockNumberOutboxLowerBound, ethBlockTag);
  if (!claim) {
    emitter.emit(BotEvents.NO_CLAIM, epoch);
    return null;
  }
  if (!transactionHandler) {
    transactionHandler = new ArbToEthTransactionHandler(
      epoch,
      veaInbox,
      veaOutbox,
      veaInboxProvider,
      veaOutboxProvider,
      defaultEmitter,
      claim
    );
  } else {
    transactionHandler.claim = claim;
  }

  const claimSnapshot = await veaInbox.snapshots(epoch, { blockTag: arbitrumBlock.number });

  if (claimSnapshot != claim.stateRoot && claim.challenger == ethers.ZeroAddress) {
    await transactionHandler.challengeClaim();
  } else {
    if (claimSnapshot == claim.stateRoot) {
      emitter.emit(BotEvents.VALID_CLAIM, epoch);
      return null;
    } else {
      const claimResolveState = await fetchClaimResolveState(
        veaInbox,
        veaInboxProvider,
        veaOutboxProvider,
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
