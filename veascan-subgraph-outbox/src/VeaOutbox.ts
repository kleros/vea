import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Challenged,
  Claimed,
  MessageRelayed,
  Verified,
  VerificationStarted,
} from "../generated/VeaOutboxArbToEthDevnet/VeaOutboxArbToEthDevnet";
import {
  Challenge,
  Claim,
  Message,
  Ref,
  Verification,
  Outbox,
} from "../generated/schema";

export function handleClaimed(event: Claimed): void {
  let outbox = Outbox.load(event.address);
  if (!outbox) {
    outbox = new Outbox(event.address);
    outbox.save();
  }
  const claimIndex = useClaimIndex(event.address);
  const claimId = event.address.toHexString() + "-" + claimIndex.toString();
  const claim = new Claim(claimId);
  claim.outbox = event.address;
  claim.epoch = event.params._epoch;
  claim.txHash = event.transaction.hash;
  claim.stateroot = event.params._stateRoot;
  claim.timestamp = event.block.timestamp;
  claim.bridger = event.transaction.from; // same as event.params.claimer
  claim.challenged = false;
  claim.verified = false;
  claim.honest = false;
  claim.save();
}

export function handleChallenged(event: Challenged): void {
  const ref = getRef(event.address);
  let outterClaim: Claim | null = null;
  for (
    let i = ref.totalClaims.minus(BigInt.fromI32(1));
    i.ge(BigInt.fromI32(0));
    i = i.minus(BigInt.fromI32(1))
  ) {
    const claimId = event.address.toHexString() + "-" + i.toString();
    const claim = Claim.load(claimId);
    if (!claim) continue;
    if (claim.epoch.equals(event.params._epoch)) {
      outterClaim = claim;
      break;
    }
  }

  if (outterClaim) {
    outterClaim.challenged = true;
    outterClaim.save();
    const challengeIndex = useChallengeIndex(event.address);
    const challengeId =
      event.address.toHexString() + "-" + challengeIndex.toString();
    const challenge = new Challenge(challengeId);
    challenge.claim = outterClaim.id;
    challenge.txHash = event.transaction.hash;
    challenge.challenger = event.transaction.from;
    challenge.timestamp = event.block.timestamp;
    challenge.honest = false;
    challenge.save();
  }
}

export function handleVerificationStarted(event: VerificationStarted): void {
  const ref = getRef(event.address);
  for (
    let i = ref.totalClaims.minus(BigInt.fromI32(1));
    i.ge(BigInt.fromI32(0));
    i = i.minus(BigInt.fromI32(1))
  ) {
    const claimId = event.address.toHexString() + "-" + i.toString();
    const claim = Claim.load(claimId);
    if (claim && claim.epoch.equals(event.params._epoch)) {
      const verification = new Verification(claim.id);
      verification.claim = claim.id;
      verification.startTimestamp = event.block.timestamp;
      verification.startCaller = event.transaction.from;
      verification.startTxHash = event.transaction.hash;
      verification.save();
      break;
    }
  }
}

export function handleVerified(event: Verified): void {
  const ref = getRef(event.address);
  for (
    let i = ref.totalClaims.minus(BigInt.fromI32(1));
    i.ge(BigInt.fromI32(0));
    i = i.minus(BigInt.fromI32(1))
  ) {
    const claimId = event.address.toHexString() + "-" + i.toString();
    const claim = Claim.load(claimId);
    if (claim && claim.epoch.equals(event.params._epoch)) {
      claim.verified = true;
      claim.save();

      let verification = Verification.load(claim.id);
      if (!verification) {
        verification = new Verification(claim.id);
        verification.claim = claim.id;
      }
      verification.verifiedTimestamp = event.block.timestamp;
      verification.verifiedCaller = event.transaction.from;
      verification.verifiedTxHash = event.transaction.hash;
      verification.save();
      break;
    }
  }
}

export function handleMessageRelayed(event: MessageRelayed): void {
  const messageId =
    event.address.toHexString() + "-" + event.params._msgId.toString();
  const message = new Message(messageId);
  message.outbox = event.address;
  message.timestamp = event.block.timestamp;
  message.txHash = event.transaction.hash;
  message.relayer = event.transaction.from;
  message.proof = Bytes.fromI32(0);
  message.save();
}

function useClaimIndex(eventAddress: Address): BigInt {
  const ref = getRef(eventAddress);
  const claimIndex = ref.totalClaims;
  ref.totalClaims = ref.totalClaims.plus(BigInt.fromI32(1));
  ref.save();
  return claimIndex;
}

function useChallengeIndex(eventAddress: Address): BigInt {
  const ref = getRef(eventAddress);
  const challengeIndex = ref.totalChallenges;
  ref.totalChallenges = ref.totalChallenges.plus(BigInt.fromI32(1));
  ref.save();
  return challengeIndex;
}

function getRef(outboxAddress: Address): Ref {
  let id = outboxAddress.toHexString();
  let ref = Ref.load(id);
  if (ref) return ref;
  else {
    ref = new Ref(id);
    ref.outbox = outboxAddress;
    ref.totalClaims = BigInt.fromI32(0);
    ref.totalMessages = BigInt.fromI32(0);
    ref.totalChallenges = BigInt.fromI32(0);
    ref.save();
    return ref;
  }
}
