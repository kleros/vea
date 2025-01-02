import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";

/**
 * Listens to relevant events of an EventEmitter instance and issues log lines
 *
 * @param emitter - The event emitter instance that issues the relevant events
 *
 * @example
 *
 * const emitter = new EventEmitter();
 * initialize(emitter);
 */

export const initialize = (emitter: EventEmitter) => {
  return configurableInitialize(emitter);
};

export const configurableInitialize = (emitter: EventEmitter) => {
  // Bridger state logs
  emitter.on(BotEvents.STARTED, () => {
    console.log("Bridger started");
  });

  emitter.on(BotEvents.CHECKING, (epoch: number) => {
    console.log(`Running checks for epoch ${epoch}`);
  });

  emitter.on(BotEvents.WAITING, (epoch: number) => {
    console.log(`Waiting for next verifiable epoch after ${epoch}`);
  });

  emitter.on(BotEvents.NO_NEW_MESSAGES, () => {
    console.log("No new messages found");
  });

  emitter.on(BotEvents.NO_SNAPSHOT, () => {
    console.log("No snapshot saved for epoch");
  });

  emitter.on(BotEvents.EPOCH_PASSED, (epoch: number) => {
    console.log(`Epoch ${epoch} has passed`);
  });

  emitter.on(BotEvents.CHALLENGER_WON_CLAIM, () => {
    console.log("Challenger won claim");
  });

  emitter.on(BotEvents.CLAIM_CHALLENGED, () => {
    console.log("Claim was challenged, skipping");
  });

  // Transaction state logs
  emitter.on(BotEvents.TXN_MADE, (transaction: string, epoch: number, state: string) => {
    console.log(`${state} transaction for ${epoch} made with hash: ${transaction}`);
  });
  emitter.on(BotEvents.TXN_PENDING, (transaction: string) => {
    console.log(`Transaction is still pending with hash: ${transaction}`);
  });

  emitter.on(BotEvents.TXN_FINAL, (transaction: string, confirmations: number) => {
    console.log(`Transaction(${transaction}) is final with ${confirmations} confirmations`);
  });

  emitter.on(BotEvents.TXN_NOT_FINAL, (transaction: string, confirmations: number) => {
    console.log(`Transaction(${transaction}) is not final yet, ${confirmations} confirmations left.`);
  });
  emitter.on(BotEvents.TXN_PENDING_CONFIRMATIONS, (transaction: string, confirmations: number) => {
    console.log(`Transaction(${transaction}) is pending with ${confirmations} confirmations`);
  });

  // Claim state logs
  // makeClaim()
  emitter.on(BotEvents.CLAIMING, (epoch: number) => {
    console.log(`Making claim for epoch ${epoch}`);
  });

  // startVerification()
  emitter.on(BotEvents.STARTING_VERIFICATION, (epoch: number) => {
    console.log(`Starting verification for epoch ${epoch}`);
  });
  emitter.on(BotEvents.VERIFICATION_CANT_START, (time) => {
    console.log(`Waiting for sequencer delay to pass to start verification, seconds left: ${time}`);
  });

  // verifySnapshot()
  emitter.on(BotEvents.VERIFYING, (epoch: number) => {
    console.log(`Verifying snapshot for epoch ${epoch}`);
  });
  emitter.on(BotEvents.CANT_VERIFY_SNAPSHOT, (time) => {
    console.log(`Waiting for min challenge period to pass to verify snapshot, seconds left: ${time}`);
  });

  // withdrawClaimDeposit()
  emitter.on(BotEvents.WITHDRAWING, (epoch: number) => {
    console.log(`Withdrawing deposit for epoch ${epoch}`);
  });
};
