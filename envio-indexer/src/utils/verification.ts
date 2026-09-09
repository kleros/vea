import { EvmOnEventContext } from "envio";

export async function getOrCreateVerification(claimId: string, context: EvmOnEventContext) {
  const existing = await context.Verification.get(claimId);
  if (existing) return existing;
  return {
    id: claimId,
    claim_id: claimId,
    startTimestamp: undefined,
    startCaller: undefined,
    startTxHash: undefined,
    verifiedTimestamp: undefined,
    verifiedCaller: undefined,
    verifiedTxHash: undefined,
  };
}
