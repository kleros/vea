import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";
import { env } from "./env";
import pino from "pino";

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

const logtailToken = process.env.LOGTAIL_TOKEN;

const loggerOptions = {
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
  level: env.optional("LOG_LEVEL", "info"),
};

export const logger = pino(loggerOptions);

export const initialize = (emitter: EventEmitter) => {
  return configurableInitialize(emitter, logger);
};

export const configurableInitialize = (emitter: EventEmitter, logger: pino.Logger) => {
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
    logger.error("Uncaught Exception occurred", err);
  });
  emitter.on(BotEvents.PROMISE_REJECTION, (reason, promise) => {
    logger.error("Unhandled promise rejection:", reason, "at", promise);
  });

  // Lock file logs
  emitter.on(BotEvents.LOCK_CLAIMED, () => {
    logger.info("Lock claimed");
  });
  emitter.on(BotEvents.LOCK_DIRECTORY, (pwd) => {
    logger.info(`Lock file directory: ${pwd}`);
  });
  emitter.on(BotEvents.LOCK_RELEASED, () => {
    logger.info("Lock released");
  });

  // Message relay logs
  emitter.on(BotEvents.RELAY_BATCH, (nonce, tx) => {
    logger.info(`Relaying batch till nonce ${nonce}: ${tx}`);
  });

  emitter.on(BotEvents.RELAY_ALL_FROM, (nonce, msgSenders, tx) => {
    logger.info(`Relaying all messages from ${msgSenders} with nonce ${nonce}: ${tx}`);
  });

  emitter.on(BotEvents.MESSAGE_EXECUTION_FAILED, (nonce) => {
    logger.error(`Message execution failed for nonce ${nonce}`);
  });
};
