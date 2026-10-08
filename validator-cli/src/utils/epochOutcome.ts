/**
 * What one cycle's work on an epoch concluded.
 *
 * Frozen interface (validator-v1-fixes seed): the helpers (`challengeAndResolveClaim`,
 * `checkAndClaim`) report an outcome through their optional `reportOutcome` callback, and
 * the watcher decides from it whether the epoch stays watched. A helper that reports
 * nothing leaves the watcher's previous rule in force.
 */
export enum EpochOutcome {
  /**
   * Nothing is left to do, so the watcher may stop watching the epoch: either its claim window has
   * closed on the outbox read block and no claim, dispute or transaction for it is pending, or the
   * claimer read `snapshots[E]` at a settled inbox block (`resolveSettledReadBlocks`: the epoch has
   * ended on an L1-backed Arbitrum block, so the value is final) and found nothing to claim.
   */
  DONE = "done",
  /** Work is in flight: a claim, challenge, snapshot, verification or resolution step. Keep watching. */
  PENDING = "pending",
  /** The epoch could not be decided this cycle (not settled yet, finality flagged, data missing, an error). Keep watching and retry next cycle. */
  UNDECIDABLE = "undecidable",
}

export type ReportOutcome = (outcome: EpochOutcome) => void;

const RANK: Record<EpochOutcome, number> = {
  [EpochOutcome.DONE]: 0,
  [EpochOutcome.PENDING]: 1,
  [EpochOutcome.UNDECIDABLE]: 2,
};

/**
 * Combine two reports for the same epoch in one cycle: the more cautious one wins
 * (UNDECIDABLE over PENDING over DONE), so one path's DONE never drops an epoch another
 * path still needs.
 */
export const mergeOutcomes = (a: EpochOutcome | undefined, b: EpochOutcome | undefined): EpochOutcome | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return RANK[a] >= RANK[b] ? a : b;
};
