import { EventEmitter } from "node:events";
import pino from "pino";
import { BotEvents } from "./botEvents";

const logtailToken = process.env.LOGTAIL_TOKEN;

const loggerOptions = {
  level: "debug",
  base: { service: "Vea" },
  transport: logtailToken
    ? {
        target: "@logtail/pino",
        options: {
          sourceToken: logtailToken,
        },
      }
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
};
const baseLogger = pino(loggerOptions);
const getLogger = (context: string) => baseLogger.child({ context });

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
  const logger = getLogger("Relayer");
  // Relayer state logs
  emitter.on(BotEvents.STARTED, (chainId, network) => {
    logger.info(`Relayer started for ${chainId} on ${network}`);
  });
  emitter.on(BotEvents.WAITING, (delayAmount) => {
    logger.info(`Waiting for next epoch: ${delayAmount} ms`);
  });
  emitter.on(BotEvents.EXIT, () => {
    logger.info("Exiting");
  });

  // Bot health logs
  emitter.on(BotEvents.EXCEPTION, (err) => {
    logger.error({ err }, "Uncaught Exception occurred");
  });
  emitter.on(BotEvents.PROMISE_REJECTION, (reason, promise) => {
    logger.error({ reason, promise }, "Unhandled promise rejection");
  });

  // Lock file logs
  emitter.on(BotEvents.LOCK_CLAIMED, () => {
    logger.debug("lock_claimed");
  });
  emitter.on(BotEvents.LOCK_DIRECTORY, (pwd) => {
    logger.debug({ pwd }, "lock_file_directory");
  });
  emitter.on(BotEvents.LOCK_RELEASED, () => {
    logger.debug("lock_released");
  });

  // Message relay logs
  emitter.on(BotEvents.RELAY_BATCH, (nonce, tx) => {
    logger.info({ nonce, tx }, "relaying_batch_till_nonce");
  });

  emitter.on(BotEvents.RELAY_ALL_FROM, (nonce, msgSenders, tx) => {
    logger.info({ nonce, msgSenders, tx }, "relaying_all_from_till_nonce");
  });

  emitter.on(BotEvents.MESSAGE_EXECUTION_FAILED, (nonce) => {
    logger.error({ nonce }, "message_execution_failed_for_nonce");
  });

  // Hashi executor logs
  emitter.on(BotEvents.EXECUTING_HASHI, (startNonce, endNonce) => {
    logger.debug({ startNonce, endNonce }, "executing_hashi");
  });
  emitter.on(BotEvents.HASHI_EXECUTED, (endNonce) => {
    logger.info({ endNonce }, "hashi_executed_till_nonce");
  });
  emitter.on(BotEvents.HASHI_BATCH_TXN, (txHash, batchSize) => {
    logger.debug({ txHash, batchSize }, "hashi_batch_txn");
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
