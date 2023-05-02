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
  Refs,
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
  claim.bridger = event.transaction.from;
  claim.challenged = false;
  claim.honest = false;
  claim.save();
}

export function handleChallenged(event: Challenged): void {
  const refs = getRefs();
  let outterClaim: Claim | null = null;
  for (
    let i = refs.totalClaims;
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
  const refs = getRefs();
  for (
    let i = refs.totalClaims;
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
  const refs = getRefs();
  const claimIndex = refs.totalClaims;
  refs.totalClaims = refs.totalClaims.plus(BigInt.fromI32(1));
  return claimIndex;
}

function useChallengeIndex(): BigInt {
  const refs = getRefs();
  const challengeIndex = refs.totalChallenges;
  refs.totalChallenges = refs.totalChallenges.plus(BigInt.fromI32(1));
  return challengeIndex;
}

function getRefs(): Refs {
  let refs = Refs.load("0");
  if (refs) return refs;
  else {
    refs = new Refs("0");
    refs.totalClaims = BigInt.fromI32(0);
    refs.totalMessages = BigInt.fromI32(0);
    refs.totalChallenges = BigInt.fromI32(0);
    refs.save();
    return refs;
  }
}
