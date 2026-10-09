import { EventEmitter } from "node:events";
import { ethers } from "ethers";
import { BotEvents } from "../utils/botEvents";
import { EpochOutcome } from "../utils/epochOutcome";
import { ITransactionHandler } from "../utils/transactionHandlers";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";

export interface BridgeShutdownParams {
  transactionHandler: ITransactionHandler;
  claim: ClaimStruct;
  /** Whose deposit this helper looks after: the claimer's or the challenger's. */
  party: "claimer" | "challenger";
  chainId: number;
  network: string;
  epoch: number;
  emitter: EventEmitter;
}

const sameAddress = (a: string | undefined, b: unknown): boolean =>
  !!a && typeof b === "string" && b !== ethers.ZeroAddress && a.toLowerCase() === b.toLowerCase();

/** Whether `party` (a claim's claimer or challenger) is our signer; false when the signer is unknown. */
export const isOurAddress = (transactionHandler: ITransactionHandler, party: unknown): boolean =>
  sameAddress(transactionHandler.getSignerAddress?.(), party);

// Route and epoch keys (`${chainId}_${network}_${epoch}`) already alerted with `bridge_shutdown`.
const shutdownAlerted = new Set<string>();

/** Test-only: forget which route and epoch keys have already raised the `bridge_shutdown` alert. */
export const resetBridgeShutdownAlerts = (): void => {
  shutdownAlerted.clear();
};

/**
 * Handle an unresolved claim (`honest == NONE`) once the bridge has timed out.
 *
 * After the contract's timeout no dispute can be resolved and no claim verified, so sending
 * a challenge, a snapshot or a verification only locks more funds. Our own deposit is
 * recovered through the escape hatch.
 *
 * @returns null while the bridge is running (the caller goes on as usual), otherwise the outcome
 */
export const handleBridgeShutdown = async ({
  transactionHandler,
  claim,
  party,
  chainId,
  network,
  epoch,
  emitter,
}: BridgeShutdownParams): Promise<EpochOutcome | null> => {
  if (Number(claim.honest) !== 0 || !transactionHandler.isBridgeShutdown) return null;
  if (!(await transactionHandler.isBridgeShutdown())) return null;

  const ours = isOurAddress(transactionHandler, party === "claimer" ? claim.claimer : claim.challenger);
  if (!ours) {
    // Shutdown is permanent: alert once per route and epoch, not every cycle or for both paths.
    const key = `${chainId}_${network}_${epoch}`;
    if (!shutdownAlerted.has(key)) {
      shutdownAlerted.add(key);
      emitter.emit(BotEvents.ALERT, { level: "error", code: "bridge_shutdown", chainId, network, epoch });
    }
    return EpochOutcome.DONE;
  }
  emitter.emit(BotEvents.ESCAPE_HATCH, { chainId, network, epoch, action: "detected", party });
  if (party === "claimer") {
    await transactionHandler.withdrawClaimerEscapeHatch?.();
  } else {
    await transactionHandler.withdrawChallengerEscapeHatch?.();
  }
  return EpochOutcome.PENDING;
};
