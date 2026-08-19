import type { VeaClaim, VeaSnapshot, VeaStatus } from "./types";

/**
 * Epoch lifecycle status, evaluated in priority order. `Verifying` is only
 * derivable because the new outbox indexer tracks VerificationStarted
 * separately from Verified (unlike the legacy veascan-web subgraph, which
 * only exposed the finished verifiedTimestamp).
 */
export function deriveStatus(snapshot: VeaSnapshot | null, claim: VeaClaim | null): VeaStatus {
  if (claim) {
    const verification = claim.verification[0];
    const verifying = verification?.startTimestamp !== undefined && verification?.verifiedTimestamp === undefined;

    if (claim.challenged && claim.verified) return "Resolved";
    if (verifying) return "Verifying";
    if (claim.challenged) return "Challenged";
    if (claim.verified) return "Verified";
    return "Claimed";
  }

  if (snapshot && (!snapshot.saved || snapshot.resolving)) return "Pending";

  return "Saved";
}
