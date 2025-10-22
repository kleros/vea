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
  // Relayer state logs
  emitter.on(BotEvents.STARTED, (chainId, network) => {
    console.log(`Relayer started for ${chainId} on ${network}`);
  });
  emitter.on(BotEvents.WAITING, (delayAmount) => {
    console.log(`Waiting for next epoch: ${delayAmount} ms`);
  });
  emitter.on(BotEvents.EXIT, () => {
    console.log("Exiting");
  });

  // Bot health logs
  emitter.on(BotEvents.EXCEPTION, (err) => {
    console.error("Uncaught Exception occurred", err);
  });
  emitter.on(BotEvents.PROMISE_REJECTION, (reason, promise) => {
    console.error("Unhandled promise rejection:", reason, "at", promise);
  });

  // Lock file logs
  emitter.on(BotEvents.LOCK_CLAIMED, () => {
    console.log("Lock claimed");
  });
  emitter.on(BotEvents.LOCK_DIRECTORY, (pwd) => {
    console.log(`Lock file directory: ${pwd}`);
  });
  emitter.on(BotEvents.LOCK_RELEASED, () => {
    console.log("Lock released");
  });

  // Message relay logs
  emitter.on(BotEvents.RELAY_BATCH, (nonce, tx) => {
    console.log(`Relaying batch till nonce ${nonce}: ${tx}`);
  });

  emitter.on(BotEvents.RELAY_ALL_FROM, (nonce, msgSenders, tx) => {
    console.log(`Relaying all messages from ${msgSenders} with nonce ${nonce}: ${tx}`);
  });

  emitter.on(BotEvents.MESSAGE_EXECUTION_FAILED, (nonce) => {
    console.error(`Message execution failed for nonce ${nonce}`);
  });

  // Hashi executor logs
  emitter.on(BotEvents.EXECUTING_HASHI, (startNonce, endNonce) => {
    console.log(`Executing Hashi for nonces from ${startNonce} to ${endNonce}`);
  });
  emitter.on(BotEvents.HASHI_EXECUTED, (endNonce) => {
    console.log(`Successfully executed Hashi till ${endNonce}`);
  });
  emitter.on(BotEvents.HASHI_BATCH_TXN, (txHash, batchSize) => {
    console.log(`Hashi batch transaction ${txHash} for ${batchSize} messages`);
  });
};
