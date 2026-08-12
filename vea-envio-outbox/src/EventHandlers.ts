import { indexer } from "envio";
import { getOrCreateVerification } from "./utils/verification";

/**
 * @dev Handles the Claimed event emitted by VeaOutbox. Upserts the Outbox entity, creates a
 * Claim keyed by the on-chain claim id, and sets the CurrentClaim for this outbox/epoch to
 * point at the new Claim.
 */
indexer.onEvent({ contract: "VeaOutbox", event: "Claimed" }, async ({ event, context }) => {
  const outbox = event.srcAddress;
  const epoch = event.params._epoch;

  const existingOutbox = await context.Outbox.get(outbox);
  if (!existingOutbox) context.Outbox.set({ id: outbox });

  const claimId = `${event.chainId}_${event.block.number}_${event.logIndex}`;
  context.Claim.set({
    id: claimId,
    outbox_id: outbox,
    epoch,
    stateRoot: event.params._stateRoot,
    bridger: event.params._claimer,
    timestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
    challenged: false,
    verified: false,
    honest: false,
  });
  // If outboxes have same addresses across chains this mapping will break and claims will be overwritten.
  context.CurrentClaim.set({
    id: `${outbox}-${epoch}`,
    claim_id: claimId,
  });
});

/**
 * @dev Handles the Challenged event emitted by VeaOutbox. Looks up the
 *      currently active claim for this epoch via CurrentClaim (O(1)), marks
 *      it challenged, and records a Challenge row against it.
 */
indexer.onEvent({ contract: "VeaOutbox", event: "Challenged" }, async ({ event, context }) => {
  const outbox = event.srcAddress;
  const epoch = event.params._epoch;
  const challenger = event.params._challenger;

  const currentClaim = await context.CurrentClaim.get(`${outbox}-${epoch}`);
  if (!currentClaim) return;

  const claim = await context.Claim.get(currentClaim.claim_id);
  if (claim) context.Claim.set({ ...claim, challenged: true });

  context.Challenge.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    claim_id: currentClaim.claim_id,
    txHash: event.transaction.hash,
    timestamp: BigInt(event.block.timestamp),
    challenger,
    honest: false,
  });
});

/**
 * @dev Handles the VerificationStarted event. Looks up the currently active
 *      claim for this epoch via CurrentClaim, then records the start of its
 *      verification window.
 */
indexer.onEvent({ contract: "VeaOutbox", event: "VerificationStarted" }, async ({ event, context }) => {
  const outbox = event.srcAddress;
  const epoch = event.params._epoch;

  const currentClaim = await context.CurrentClaim.get(`${outbox}-${epoch}`);
  if (!currentClaim) return;

  const verification = await getOrCreateVerification(currentClaim.claim_id, context);
  context.Verification.set({
    ...verification,
    startTimestamp: BigInt(event.block.timestamp),
    startCaller: event.transaction.from,
    startTxHash: event.transaction.hash,
  });
});

/**
 * @dev Handles the Verified event. Looks up the currently active claim for
 *      this epoch, marks it verified, and records the verification's
 *      completion.
 */
indexer.onEvent({ contract: "VeaOutbox", event: "Verified" }, async ({ event, context }) => {
  const outbox = event.srcAddress;
  const epoch = event.params._epoch;

  const currentClaim = await context.CurrentClaim.get(`${outbox}-${epoch}`);
  if (!currentClaim) return;

  const claim = await context.Claim.get(currentClaim.claim_id);
  if (claim) context.Claim.set({ ...claim, verified: true });

  const verification = await getOrCreateVerification(currentClaim.claim_id, context);
  context.Verification.set({
    ...verification,
    verifiedTimestamp: BigInt(event.block.timestamp),
    verifiedCaller: event.transaction.from,
    verifiedTxHash: event.transaction.hash,
  });
});

/**
 * @dev Handles the MessageRelayed event. Upserts the Outbox entity and
 *      creates a Message keyed by the on-chain message id.
 */
indexer.onEvent({ contract: "VeaOutbox", event: "MessageRelayed" }, async ({ event, context }) => {
  const outbox = event.srcAddress;
  const msgId = event.params._msgId;

  const existingOutbox = await context.Outbox.get(outbox);
  if (!existingOutbox) context.Outbox.set({ id: outbox });

  context.Message.set({
    id: `${outbox}-${msgId}`,
    outbox_id: outbox,
    timestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
    relayer: event.transaction.from!,
  });
});
