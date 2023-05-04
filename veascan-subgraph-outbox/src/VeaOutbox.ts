import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Challenged,
  Claimed,
  MessageRelayed,
  Verified,
  VeaOutbox,
} from "../generated/VeaOutbox/VeaOutbox";
import {
  Challenge,
  Claim,
  Message,
  Ref,
  Verification,
} from "../generated/schema";

export function handleClaimed(event: Claimed): void {
  const claim = getNextClaim();
  const outbox = VeaOutbox.bind(event.address);
  const claimDelay = outbox.claimDelay();
  const epochPeriod = outbox.epochPeriod();
  const epoch = event.block.timestamp.minus(claimDelay).div(epochPeriod);
  claim.epoch = epoch;
  claim.txHash = event.transaction.hash;
  claim.stateroot = event.params.stateRoot;
  claim.timestamp = event.block.timestamp;
  claim.bridger = event.transaction.from; // same as event.params.claimer
  claim.challenged = false;
  claim.honest = false;
  claim.save();
}

export function handleChallenged(event: Challenged): void {
  const ref = getRef();
  let outterClaim: Claim | null = null;
  for (
    let i = ref.totalClaims;
    i.ge(BigInt.fromI32(0));
    i.minus(BigInt.fromI32(1))
  ) {
    const claim = Claim.load(i.toString());
    if (!claim) continue;
    if (claim.epoch.equals(event.params.epoch)) {
      outterClaim = claim;
      break;
    }
  }

  if (outterClaim) {
    outterClaim.challenged = true;
    outterClaim.save();
    const challengeIndex = useChallengeIndex();
    const challenge = new Challenge(challengeIndex.toString());
    challenge.claim = outterClaim.id;
    challenge.txHash = event.transaction.hash;
    challenge.challenger = event.transaction.from;
    challenge.timestamp = event.block.timestamp;
    challenge.honest = false;
    challenge.save();
  }
}

export function handleVerified(event: Verified): void {
  const ref = getRef();
  for (
    let i = ref.totalClaims;
    i.ge(BigInt.fromI32(0));
    i.minus(BigInt.fromI32(1))
  ) {
    const claim = Claim.load(i.toString());
    if (!claim) continue;
    if (claim.honest) break;
    if (claim.epoch.equals(event.params.epoch)) {
      const verification = new Verification(claim.id);
      verification.claim = claim.id;
      verification.timestamp = event.block.timestamp;
      verification.caller = event.transaction.from;
      verification.txHash = event.transaction.hash;
      verification.save();
    }
    if (claim.epoch.le(event.params.epoch)) {
      claim.honest = true;
      claim.save();
    }
  }
}

export function handleMessageRelayed(event: MessageRelayed): void {
  const message = new Message(event.params.msgId.toString());
  message.timestamp = event.block.timestamp;
  message.txHash = event.transaction.hash;
  message.relayer = event.transaction.from;
  message.proof = Bytes.fromI32(0);
  message.save();
}

function getNextClaim(): Claim {
  const claimIndex = getNextClaimIndex();
  return new Claim(claimIndex.toString());
}

function getNextClaimIndex(): BigInt {
  const ref = getRef();
  const claimIndex = ref.totalClaims;
  ref.totalClaims = ref.totalClaims.plus(BigInt.fromI32(1));
  return claimIndex;
}

function useChallengeIndex(): BigInt {
  const ref = getRef();
  const challengeIndex = ref.totalChallenges;
  ref.totalChallenges = ref.totalChallenges.plus(BigInt.fromI32(1));
  return challengeIndex;
}

function getRef(): Ref {
  let ref = Ref.load("0");
  if (ref) return ref;
  else {
    ref = new Ref("0");
    ref.totalClaims = BigInt.fromI32(0);
    ref.totalMessages = BigInt.fromI32(0);
    ref.totalChallenges = BigInt.fromI32(0);
    ref.save();
    return ref;
  }
}
