import { EventEmitter } from "node:events";
import pino from "pino";
import { BotEvents } from "./botEvents";

const localDeploy = process.env.LOCAL_DEPLOY === "true";

const loggerOptions = {
  level: "debug",
  base: { service: "Vea" },
  transport: !localDeploy
    ? undefined
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
    logger.info({ chainId, network }, `relayer_started`);
  });
  emitter.on(BotEvents.WAITING, (delayAmount) => {
    logger.info({ delayAmount }, "waiting_for_next_cycle");
  });
  emitter.on(BotEvents.EXIT, () => {
    logger.info("exiting");
  });

  // Bot health logs
  emitter.on(BotEvents.EXCEPTION, (err) => {
    logger.error({ err }, "uncaught_exception");
  });
  emitter.on(BotEvents.PROMISE_REJECTION, (reason, promise) => {
    logger.error({ reason, promise }, "unhandled_promise_rejection");
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
  emitter.on(BotEvents.HASHI_EXECUTED, (blockNumber) => {
    logger.info({ blockNumber }, "hashi_executed_till_block"); // block number is of source chain
  });
  emitter.on(BotEvents.HASHI_BATCH_TXN, (txHash, batchSize) => {
    logger.debug({ txHash, batchSize }, "hashi_batch_txn");
  });
  emitter.on(BotEvents.HASHI_MESSAGE_FAILING, (nonce, sourceChainId, targetChainId) => {
    logger.warn({ nonce, sourceChainId, targetChainId }, "hashi_message_failing");
  });
};
