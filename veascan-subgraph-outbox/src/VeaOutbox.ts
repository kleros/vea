import { BigInt } from "@graphprotocol/graph-ts";
import {
  ChallengeDepositWithdrawn,
  ChallengeDepositWithdrawnTimeout,
  Challenged,
  ClaimDepositWithdrawn,
  ClaimDepositWithdrawnTimeout,
  Claimed,
  MessageRelayed,
  Verified,
} from "../generated/VeaOutbox/VeaOutbox";
import { Challenge, Claim, Message, Refs } from "../generated/schema";

export function handleChallengeDepositWithdrawn(
  event: ChallengeDepositWithdrawn
): void {
  const claim = getCurrentClaim(event.params.epoch);
  claim.id = event.params.epoch;
  claim.depositAndRewardWithdrawn = true;
  claim.challenged = true;
  claim.honest = true;
  claim.save();

  const numberOfChallenges = useNumberOfChallenges();
  const challenge = new Challenge(numberOfChallenges.toString());
  challenge.honest = true;
  challenge.challenger = event.params._challenger;
  challenge.depositAndRewardWithdrawn = true;
  challenge.save();
}

// this does seem to have same info with handleChallengeDepositWithdrawn
export function handleChallengeDepositWithdrawnTimeout(
  event: ChallengeDepositWithdrawnTimeout
): void {}

export function handleChallenged(event: Challenged): void {
  const claim = getCurrentClaim(event.params.epoch);
  claim.id = event.params.epoch;
  claim.challenged = true;
  claim.timestamp = event.block.timestamp;
  claim.save();

  const numberOfChallenges = useNumberOfChallenges();
  const challenge = new Challenge(numberOfChallenges.toString());
  challenge.claim = claim.id;
  challenge.honest = true;
  challenge.depositAndRewardWithdrawn = false;
  challenge.save();
}

export function handleClaimDepositWithdrawn(
  event: ClaimDepositWithdrawn
): void {
  const claim = getCurrentClaim(event.params.epoch);
  claim.id = event.params.epoch;
  claim.depositAndRewardWithdrawn = true;
  // claim.challenged = true;
  claim.bridger = event.params._bridger;
  claim.honest = true;
  claim.save();
}

// this does seem to have same info with handleClaimDepositWithdrawn
export function handleClaimDepositWithdrawnTimeout(
  event: ClaimDepositWithdrawnTimeout
): void {}

export function handleMessageRelayed(event: MessageRelayed): void {
  const message = new Message("0");
  message.id = event.params.msgId;
  message.save();
}
export function handleClaimed(event: Claimed): void {
  const claim = getCurrentClaim(event.params.epoch);
  claim.id = event.params.epoch;
  claim.stateroot = event.params.claimedStateRoot;

  claim.timestamp = event.block.timestamp;

  claim.save();
}

export function handleVerified(event: Verified): void {
  const claim = getCurrentClaim(event.params.epoch);
  claim.epoch = event.params.epoch;
  claim.blockTimestamp = event.block.timestamp;

  claim.save();
}

function getCurrentClaim(epoch: BigInt): Claim {
  let refs = Refs.load("0");
  if (!refs) {
    refs = new Refs("0");
    refs.numberOfMessages = BigInt.fromI32(0);
    refs.numberOfChallenges = BigInt.fromI32(0);
    refs.save();
    const claim = new Claim("0");
    claim.honest = true;
    claim.challenged = false;
    claim.save();
    return claim;
  }
  return Claim.load(epoch.toString())!;
}

// function getChallenge(): Challenge {
//   let refs = Refs.load("0");
//   if (!refs) {
//     refs = new Refs("0");
//     refs.numberOfMessages = BigInt.fromI32(0);
//     refs.numberOfChallenges = BigInt.fromI32(1);
//     refs.save();
//     const challenge = new Challenge("0");
//     challenge.honest = false;
//     challenge.depositAndRewardWithdrawn = false;
//     challenge.save();
//     return challenge;
//   }
//   return Challenge.load(refs.numberOfChallenges.toString())!;
// }

function useNumberOfChallenges(): BigInt {
  let refs = Refs.load("0");
  if (!refs) {
    refs = new Refs("0");
    refs.numberOfChallenges = BigInt.fromI32(1);
    refs.save();
    return BigInt.fromI32(0);
  }
  const numberOfChallenges = refs.numberOfChallenges;
  refs.numberOfChallenges = refs.numberOfChallenges.plus(BigInt.fromI32(1));
  refs.save();
  return numberOfChallenges;
}
