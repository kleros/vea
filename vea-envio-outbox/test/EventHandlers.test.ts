import { createTestIndexer } from "envio";

const OUTBOX = "0xf720FA4575FB2FE96c7f05B1b5abc2d281cDa09a";
const CLAIMER = ("0x" + "c1a1".repeat(10)) as `0x${string}`;
const STATE_ROOT = "0x" + "5f0d".repeat(16);
const CLAIM_TX_HASH = "0x" + "c1a2".repeat(16);
const CHALLENGER = ("0x" + "c4a1".repeat(10)) as `0x${string}`;
const CHALLENGE_TX_HASH = "0x" + "c4a2".repeat(16);
const RELAYING_CONTRACT = ("0x" + "aabb".repeat(10)) as `0x${string}`;
const CHALLENGING_CONTRACT = ("0x" + "ccdd".repeat(10)) as `0x${string}`;

describe("handleClaimed", () => {
  it("creates a Claim and points CurrentClaim at it", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: "VeaOutbox",
              event: "Claimed",
              srcAddress: OUTBOX,
              transaction: { hash: CLAIM_TX_HASH, from: RELAYING_CONTRACT },
              params: { _claimer: CLAIMER, _epoch: 5n, _stateRoot: STATE_ROOT },
            },
          ],
        },
      },
    });

    const claims = await indexer.Claim.getAll();
    expect(claims).toHaveLength(1);
    const claim = claims[0];
    expect(claim.outbox_id).toBe(OUTBOX);
    expect(claim.epoch).toBe(5n);
    expect(claim.stateRoot).toBe(STATE_ROOT);
    expect(claim.bridger).toBe(CLAIMER);
    expect(claim.txHash).toBe(CLAIM_TX_HASH);
    expect(claim.challenged).toBe(false);
    expect(claim.verified).toBe(false);
    expect(claim.honest).toBe(false);

    const currentClaim = await indexer.CurrentClaim.getOrThrow(`${OUTBOX}-5`);
    expect(currentClaim.claim_id).toBe(claim.id);
  });
});

describe("handleChallenged", () => {
  it("marks the current claim challenged and records a Challenge", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: "VeaOutbox",
              event: "Claimed",
              srcAddress: OUTBOX,
              transaction: { hash: CLAIM_TX_HASH, from: CLAIMER },
              params: { _claimer: CLAIMER, _epoch: 5n, _stateRoot: STATE_ROOT },
            },
            {
              contract: "VeaOutbox",
              event: "Challenged",
              srcAddress: OUTBOX,
              transaction: { hash: CHALLENGE_TX_HASH, from: CHALLENGING_CONTRACT },
              params: { _epoch: 5n, _challenger: CHALLENGER },
            },
          ],
        },
      },
    });

    const currentClaim = await indexer.CurrentClaim.getOrThrow(`${OUTBOX}-5`);
    const claim = await indexer.Claim.getOrThrow(currentClaim.claim_id);
    expect(claim.challenged).toBe(true);

    const challenges = await indexer.Challenge.getAll();
    expect(challenges).toHaveLength(1);
    expect(challenges[0].claim_id).toBe(claim.id);
    expect(challenges[0].challenger).toBe(CHALLENGER);
    expect(challenges[0].txHash).toBe(CHALLENGE_TX_HASH);
    expect(challenges[0].honest).toBe(false);
  });

  it("does nothing when Challenged fires for an epoch with no prior claim", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: "VeaOutbox",
              event: "Challenged",
              srcAddress: OUTBOX,
              transaction: { hash: CHALLENGE_TX_HASH, from: CHALLENGER },
              params: { _epoch: 999n, _challenger: CHALLENGER },
            },
          ],
        },
      },
    });

    const challenges = await indexer.Challenge.getAll();
    expect(challenges).toHaveLength(0);
  });
});

describe("re-claim after a resolved challenge", () => {
  it("repoints CurrentClaim at the newer claim, and a later Challenged targets the new claim, not the old one", async () => {
    const indexer = createTestIndexer();
    const CLAIM_TX_HASH_2 = "0x" + "c1a3".repeat(16);
    const CHALLENGE_TX_HASH_2 = "0x" + "c4a3".repeat(16);
    const CHALLENGER_2 = ("0x" + "c4a4".repeat(10)) as `0x${string}`;

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: "VeaOutbox",
              event: "Claimed",
              srcAddress: OUTBOX,
              transaction: { hash: CLAIM_TX_HASH, from: CLAIMER },
              params: { _claimer: CLAIMER, _epoch: 9n, _stateRoot: STATE_ROOT },
            },
            {
              contract: "VeaOutbox",
              event: "Challenged",
              srcAddress: OUTBOX,
              transaction: { hash: CHALLENGE_TX_HASH, from: CHALLENGER },
              params: { _epoch: 9n, _challenger: CHALLENGER },
            },
            {
              contract: "VeaOutbox",
              event: "Claimed",
              srcAddress: OUTBOX,
              transaction: { hash: CLAIM_TX_HASH_2, from: CLAIMER },
              params: { _claimer: CLAIMER, _epoch: 9n, _stateRoot: STATE_ROOT },
            },
            {
              contract: "VeaOutbox",
              event: "Challenged",
              srcAddress: OUTBOX,
              transaction: { hash: CHALLENGE_TX_HASH_2, from: CHALLENGER_2 },
              params: { _epoch: 9n, _challenger: CHALLENGER_2 },
            },
          ],
        },
      },
    });

    const allClaims = await indexer.Claim.getAll();
    const claimsForEpoch9 = allClaims.filter((c) => c.epoch === 9n);
    expect(claimsForEpoch9).toHaveLength(2);

    const secondClaim = claimsForEpoch9.find((c) => c.txHash === CLAIM_TX_HASH_2)!;
    const currentClaim = await indexer.CurrentClaim.getOrThrow(`${OUTBOX}-9`);
    expect(currentClaim.claim_id).toBe(secondClaim.id);

    const challenges = await indexer.Challenge.getAll();
    expect(challenges).toHaveLength(2);
    const secondChallenge = challenges.find((c) => c.txHash === CHALLENGE_TX_HASH_2)!;
    expect(secondChallenge.claim_id).toBe(secondClaim.id);

    const firstClaim = claimsForEpoch9.find((c) => c.txHash === CLAIM_TX_HASH)!;
    expect(firstClaim.challenged).toBe(true);
    expect(secondClaim.challenged).toBe(true);
  });
});

describe("handleVerificationStarted and handleVerified", () => {
  it("records the verification lifecycle on the current claim", async () => {
    const indexer = createTestIndexer();
    const VERIFIER = ("0x" + "7e2f".repeat(10)) as `0x${string}`;
    const VERIFY_START_TX_HASH = "0x" + "7e30".repeat(16);
    const VERIFY_TX_HASH = "0x" + "7e31".repeat(16);

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: "VeaOutbox",
              event: "Claimed",
              srcAddress: OUTBOX,
              transaction: { hash: CLAIM_TX_HASH, from: CLAIMER },
              params: { _claimer: CLAIMER, _epoch: 12n, _stateRoot: STATE_ROOT },
            },
            {
              contract: "VeaOutbox",
              event: "VerificationStarted",
              srcAddress: OUTBOX,
              transaction: { hash: VERIFY_START_TX_HASH, from: VERIFIER },
              params: { _epoch: 12n },
            },
            {
              contract: "VeaOutbox",
              event: "Verified",
              srcAddress: OUTBOX,
              transaction: { hash: VERIFY_TX_HASH, from: VERIFIER },
              params: { _epoch: 12n },
            },
          ],
        },
      },
    });

    const currentClaim = await indexer.CurrentClaim.getOrThrow(`${OUTBOX}-12`);
    const claim = await indexer.Claim.getOrThrow(currentClaim.claim_id);
    expect(claim.verified).toBe(true);

    const verification = await indexer.Verification.getOrThrow(claim.id);
    expect(verification.startCaller).toBe(VERIFIER);
    expect(verification.startTxHash).toBe(VERIFY_START_TX_HASH);
    expect(verification.verifiedCaller).toBe(VERIFIER);
    expect(verification.verifiedTxHash).toBe(VERIFY_TX_HASH);
  });
});

describe("handleMessageRelayed", () => {
  it("creates a Message keyed by outbox and msgId", async () => {
    const indexer = createTestIndexer();
    const RELAYER = ("0x" + "2e1a".repeat(10)) as `0x${string}`;
    const RELAY_TX_HASH = "0x" + "2e1b".repeat(16);

    await indexer.process({
      chains: {
        11155111: {
          simulate: [
            {
              contract: "VeaOutbox",
              event: "MessageRelayed",
              srcAddress: OUTBOX,
              transaction: { hash: RELAY_TX_HASH, from: RELAYER },
              params: { _msgId: 42n },
            },
          ],
        },
      },
    });

    const message = await indexer.Message.getOrThrow(`${OUTBOX}-42`);
    expect(message.outbox_id).toBe(OUTBOX);
    expect(message.relayer).toBe(RELAYER);
    expect(message.txHash).toBe(RELAY_TX_HASH);
  });
});
