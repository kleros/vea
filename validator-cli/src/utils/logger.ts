import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";
import { BotPaths } from "./botConfig";
import { Network } from "../consts/bridgeRoutes";
import pino from "pino";
import { env } from "./env";

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
  // Bridger state logs
  emitter.on(BotEvents.STARTED, (path: BotPaths, networks: Network[]) => {
    let pathString = "claimer and challenger";
    if (path === BotPaths.CLAIMER) {
      pathString = "claimer";
    } else if (path === BotPaths.CHALLENGER) {
      pathString = "challenger";
    }
    logger.info(`Bot started for ${pathString} on ${networks}`);
  });

  emitter.on(BotEvents.WATCHING, (chainId: number, network: Network) => {
    logger.info(`Watching for chain ${chainId} on ${network}`);
  });

  emitter.on(BotEvents.CHECKING, (epoch: number) => {
    logger.info(`Running checks for epoch ${epoch}`);
  });

  emitter.on(BotEvents.WAITING, (epoch: number) => {
    logger.info(`Waiting for next verifiable epoch after ${epoch}`);
  });

  emitter.on(BotEvents.NO_CLAIM_REQUIRED, (epoch: number) => {
    logger.info(`No claim is required for epoch ${epoch}`);
  });

  // Epoch state logs
  emitter.on(BotEvents.NO_SNAPSHOT, () => {
    logger.info("No snapshot saved for epoch");
  });

  emitter.on(BotEvents.CLAIM_EPOCH_PASSED, (epoch: number) => {
    logger.info(`Epoch ${epoch} has passed for claiming`);
  });

  // Transaction state logs
  emitter.on(BotEvents.TXN_MADE, (transaction: string, epoch: number, state: string) => {
    logger.info(`${state} transaction for ${epoch} made with hash: ${transaction}`);
  });
  emitter.on(BotEvents.TXN_PENDING, (transaction: string) => {
    logger.info(`Transaction is still pending with hash: ${transaction}`);
  });

  emitter.on(BotEvents.TXN_FINAL, (transaction: string, confirmations: number) => {
    logger.info(`Transaction(${transaction}) is final with ${confirmations} confirmations`);
  });

  emitter.on(BotEvents.TXN_NOT_FINAL, (transaction: string, confirmations: number) => {
    logger.info(`Transaction(${transaction}) is not final yet, ${confirmations} confirmations left.`);
  });
  emitter.on(BotEvents.TXN_PENDING_CONFIRMATIONS, (transaction: string, confirmations: number) => {
    logger.info(`Transaction(${transaction}) is pending with ${confirmations} confirmations`);
  });
  emitter.on(BotEvents.TXN_EXPIRED, (transaction: string) => {
    logger.info(`Transaction(${transaction}) is expired`);
  });

  // Snapshot state logs
  emitter.on(BotEvents.SAVING_SNAPSHOT, (epoch: number) => {
    logger.info(`Saving snapshot for epoch ${epoch}`);
  });
  emitter.on(BotEvents.SNAPSHOT_WAITING, (time: number) => {
    logger.info(`Waiting for saving snapshot, time left: ${time}`);
  });

  // Claim state logs
  // claim()
  emitter.on(BotEvents.CLAIMING, (epoch: number) => {
    logger.info(`Claiming for epoch ${epoch}`);
  });
  // startVerification()
  emitter.on(BotEvents.STARTING_VERIFICATION, (epoch: number) => {
    logger.info(`Starting verification for epoch ${epoch}`);
  });
  emitter.on(BotEvents.VERIFICATION_CANT_START, (epoch: number, timeLeft: number) => {
    logger.info(`Verification cant start for epoch ${epoch}, time left: ${timeLeft}`);
  });
  // verifySnapshot()
  emitter.on(BotEvents.VERIFYING_SNAPSHOT, (epoch: number) => {
    logger.info(`Verifying snapshot for epoch ${epoch}`);
  });
  emitter.on(BotEvents.CANT_VERIFY_SNAPSHOT, (epoch: number, timeLeft: number) => {
    logger.info(`Cant verify snapshot for epoch ${epoch}, time left: ${timeLeft}`);
  });
  // challenge()
  emitter.on(BotEvents.CHALLENGING, (epoch: number) => {
    logger.info(`Claim can be challenged, challenging for epoch ${epoch}`);
  });
  emitter.on(BotEvents.CLAIM_CHALLENGED, (epoch: number) => {
    logger.info(`Claim is challenged for epoch ${epoch}`);
  });
  // startVerification()
  emitter.on(BotEvents.SENDING_SNAPSHOT, (epoch: number) => {
    logger.info(`Sending snapshot for ${epoch}`);
  });
  // executeSnapshot()
  emitter.on(BotEvents.EXECUTING_SNAPSHOT, (epoch) => {
    logger.info(`Executing snapshot to resolve dispute for epoch ${epoch}`);
  });
  // verifySnapshot()
  emitter.on(BotEvents.CANT_EXECUTE_SNAPSHOT, () => {
    logger.info("Cant execute snapshot, waiting l2 challenge period to pass");
  });
  // withdrawClaimDeposit()
  emitter.on(BotEvents.WITHDRAWING_CHALLENGE_DEPOSIT, () => {
    logger.info(`Withdrawing challenge deposit for epoch`);
  });
  emitter.on(BotEvents.WAITING_ARB_TIMEOUT, (epoch: number) => {
    logger.info(`Waiting for arbitrum bridge timeout for epoch ${epoch}`);
  });

  // validator
  emitter.on(BotEvents.NO_CLAIM, (epoch: number) => {
    logger.info(`No claim was made for ${epoch}`);
  });
  emitter.on(BotEvents.VALID_CLAIM, (epoch: number) => {
    logger.info(`Valid claim was made for ${epoch}`);
  });
  emitter.on(BotEvents.CHALLENGER_WON_CLAIM, () => {
    logger.info("Challenger won claim");
  });
};
