import { EventEmitter } from "node:events";
import pino from "pino";
import { BotEvents } from "./botEvents";
import { BotPaths } from "./botConfig";
import { Network } from "../consts/bridgeRoutes";

const logtailToken = process.env.LOGTAIL_TOKEN;

const loggerOptions = {
  level: "info",
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
  const logger = getLogger("Validator");
  // Bridger state logs
  emitter.on(BotEvents.STARTED, (path: BotPaths, networks: Network[]) => {
    let pathString = "claimer and challenger";
    if (path === BotPaths.CLAIMER) {
      pathString = "claimer";
    } else if (path === BotPaths.CHALLENGER) {
      pathString = "challenger";
    }
    logger.info({ paths: pathString, networks }, `validator_started`);
  });

  emitter.on(BotEvents.WATCHING, (chainId: number, network: Network) => {
    logger.info({ chainId, network }, `watching_chain`);
  });

  emitter.on(BotEvents.CHECKING, (epoch: number) => {
    logger.debug({ epoch }, `checking_epoch`);
  });

  emitter.on(BotEvents.WAITING, (epoch: number) => {
    logger.debug({ epoch }, `waiting_epoch`);
  });

  emitter.on(BotEvents.NO_CLAIM_REQUIRED, (epoch: number) => {
    logger.debug({ epoch }, `waiting_next_epoch`);
  });

  // Epoch state logs
  emitter.on(BotEvents.NO_SNAPSHOT, () => {
    logger.debug(`no_snapshot`);
  });

  emitter.on(BotEvents.CLAIM_EPOCH_PASSED, (epoch: number) => {
    logger.debug({ epoch }, `claim_epoch_passed`);
  });

  // Transaction state logs
  emitter.on(BotEvents.TXN_MADE, (transaction: string, epoch: number, state: string) => {
    logger.info({ txHash: transaction, epoch, state }, "txn_made");
  });
  emitter.on(BotEvents.TXN_PENDING, (transaction: string) => {
    logger.warn({ txHash: transaction }, "txn_pending");
  });

  emitter.on(BotEvents.TXN_FINAL, (transaction: string, confirmations: number) => {
    logger.info({ txHash: transaction, confirmations }, "txn_final");
  });

  emitter.on(BotEvents.TXN_NOT_FINAL, (transaction: string, confirmations: number) => {
    logger.warn({ txHash: transaction, confirmations }, "txn_not_final");
  });
  emitter.on(BotEvents.TXN_PENDING_CONFIRMATIONS, (transaction: string, confirmations: number) => {
    logger.warn({ txHash: transaction, confirmations }, "txn_pending_confirmations");
  });
  emitter.on(BotEvents.TXN_EXPIRED, (transaction: string) => {
    logger.error({ txHash: transaction }, "txn_expired");
  });

  // Snapshot state logs
  emitter.on(BotEvents.SAVING_SNAPSHOT, (epoch: number) => {
    logger.debug({ epoch }, `saving_snapshot`);
  });
  emitter.on(BotEvents.SNAPSHOT_WAITING, (time: number) => {
    logger.debug({ timeLeftSec: time }, `snapshot_waiting`);
  });

  // Claim state logs
  // claim()
  emitter.on(BotEvents.CLAIMING, (epoch: number) => {
    logger.debug({ epoch }, `claiming_epoch`);
  });
  // startVerification()
  emitter.on(BotEvents.STARTING_VERIFICATION, (epoch: number) => {
    logger.debug({ epoch }, `starting_verification`);
  });
  emitter.on(BotEvents.VERIFICATION_CANT_START, (epoch: number, timeLeft: number) => {
    logger.debug({ epoch, timeLeftSec: timeLeft }, `verification_cant_start`);
  });
  // verifySnapshot()
  emitter.on(BotEvents.VERIFYING_SNAPSHOT, (epoch: number) => {
    logger.debug({ epoch }, `verifying_snapshot`);
  });
  emitter.on(BotEvents.CANT_VERIFY_SNAPSHOT, (epoch: number, timeLeft: number) => {
    logger.debug({ epoch, timeLeftSec: timeLeft }, `cant_verify_snapshot`);
  });
  // challenge()
  emitter.on(BotEvents.CHALLENGING, (epoch: number) => {
    logger.debug({ epoch }, `challenging_epoch`);
  });
  emitter.on(BotEvents.CLAIM_CHALLENGED, (epoch: number) => {
    logger.info({ epoch }, `claim_challenged`);
  });
  // startVerification()
  emitter.on(BotEvents.SENDING_SNAPSHOT, (epoch: number) => {
    logger.debug({ epoch }, `sending_snapshot`);
  });
  // executeSnapshot()
  emitter.on(BotEvents.EXECUTING_SNAPSHOT, (epoch) => {
    logger.debug({ epoch }, `executing_snapshot`);
  });
  // verifySnapshot()
  emitter.on(BotEvents.CANT_EXECUTE_SNAPSHOT, () => {
    logger.debug(`cant_execute_snapshot`);
  });
  // withdrawClaimDeposit()
  emitter.on(BotEvents.WITHDRAWING_CHALLENGE_DEPOSIT, () => {
    logger.debug(`withdrawing_challenge_deposit`);
  });
  emitter.on(BotEvents.WAITING_ARB_TIMEOUT, (epoch: number) => {
    logger.debug({ epoch }, `waiting_arb_timeout`);
  });

  // validator
  emitter.on(BotEvents.NO_CLAIM, (epoch: number) => {
    logger.debug({ epoch }, `no_claim`);
  });
  emitter.on(BotEvents.VALID_CLAIM, (epoch: number) => {
    logger.debug({ epoch }, `valid_claim`);
  });
  emitter.on(BotEvents.CHALLENGER_WON_CLAIM, () => {
    logger.debug("challenger_won_claim");
  });
  emitter.on(BotEvents.CLAIM_ALREADY_RESOLVED, (epoch: number) => {
    logger.debug({ epoch }, `claim_already_resolved`);
  });

  // error logs
  emitter.on(BotEvents.NO_CLAIM_FETCHED, (epoch: number, fromBlock?: number, toBlock?: number) => {
    logger.error({ epoch, fromBlock, toBlock }, `no_claim_fetched`);
  });
  emitter.on(BotEvents.CLAIM_MISMATCH, (epoch: number) => {
    logger.error({ epoch }, `claim_mismatch`);
  });
};
