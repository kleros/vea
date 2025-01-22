import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";
import { BotPaths } from "./cli";

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
  emitter.on(BotEvents.STARTED, (chainId: number, path: number) => {
    let pathString = "challenger and claimer";
    if (path === BotPaths.CLAIMER) {
      pathString = "bridger";
    } else if (path === BotPaths.CHALLENGER) {
      pathString = "challenger";
    }
    console.log(`Bot started for chainId ${chainId} as ${pathString}`);
  });

  emitter.on(BotEvents.CHECKING, (epoch: number) => {
    console.log(`Running checks for epoch ${epoch}`);
  });

  emitter.on(BotEvents.WAITING, (epoch: number) => {
    console.log(`Waiting for next verifiable epoch after ${epoch}`);
  });

  // Epoch state logs
  emitter.on(BotEvents.NO_SNAPSHOT, () => {
    console.log("No snapshot saved for epoch");
  });

  emitter.on(BotEvents.CLAIM_EPOCH_PASSED, (epoch: number) => {
    console.log(`Epoch ${epoch} has passed for claiming`);
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
  // claim()
  emitter.on(BotEvents.CLAIMING, (epoch: number) => {
    console.log(`Claiming for epoch ${epoch}`);
  });
  // startVerification()
  emitter.on(BotEvents.STARTING_VERIFICATION, (epoch: number) => {
    console.log(`Starting verification for epoch ${epoch}`);
  });
  emitter.on(BotEvents.VERIFICATION_CANT_START, (epoch: number, timeLeft: number) => {
    console.log(`Verification cant start for epoch ${epoch}, time left: ${timeLeft}`);
  });
  // verifySnapshot()
  emitter.on(BotEvents.VERIFYING_SNAPSHOT, (epoch: number) => {
    console.log(`Verifying snapshot for epoch ${epoch}`);
  });
  emitter.on(BotEvents.CANT_VERIFY_SNAPSHOT, (epoch: number, timeLeft: number) => {
    console.log(`Cant verify snapshot for epoch ${epoch}, time left: ${timeLeft}`);
  });
  // challenge()
  emitter.on(BotEvents.CHALLENGING, (epoch: number) => {
    console.log(`Claim can be challenged, challenging for epoch ${epoch}`);
  });
  // startVerification()
  emitter.on(BotEvents.SENDING_SNAPSHOT, (epoch: number) => {
    console.log(`Sending snapshot for ${epoch}`);
  });
  // executeSnapshot()
  emitter.on(BotEvents.EXECUTING_SNAPSHOT, (epoch) => {
    console.log(`Executing snapshot to resolve dispute for epoch ${epoch}`);
  });
  // verifySnapshot()
  emitter.on(BotEvents.CANT_EXECUTE_SNAPSHOT, () => {
    console.log("Cant execute snapshot, waiting l2 challenge period to pass");
  });
  // withdrawClaimDeposit()
  emitter.on(BotEvents.WITHDRAWING_CHALLENGE_DEPOSIT, () => {
    console.log(`Withdrawing challenge deposit for epoch`);
  });
  emitter.on(BotEvents.WAITING_ARB_TIMEOUT, (epoch: number) => {
    console.log(`Waiting for arbitrum bridge timeout for epoch ${epoch}`);
  });

  // validator
  emitter.on(BotEvents.NO_CLAIM, (epoch: number) => {
    console.log(`No claim was made for ${epoch}`);
  });
  emitter.on(BotEvents.VALID_CLAIM, (epoch: number) => {
    console.log(`Valid claim was made for ${epoch}`);
  });
  emitter.on(BotEvents.CHALLENGER_WON_CLAIM, () => {
    console.log("Challenger won claim");
  });
};
