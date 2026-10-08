import { EventEmitter } from "node:events";
import pino from "pino";
import {
  BotEvents,
  EpochFailedPayload,
  RouteFailedPayload,
  HeartbeatFailedPayload,
  ShutdownRequestedPayload,
  EpochDroppedPayload,
  FinalityFallbackPayload,
  FailedResolutionPayload,
  EscapeHatchPayload,
  CannotFundPayload,
  LivenessAlarmPayload,
  AlertPayload,
} from "./botEvents";
import { BotPaths } from "./botConfig";
import { Network } from "../consts/bridgeRoutes";
import { redactUrlsInText } from "./fallbackProvider";

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

/** The slice of a pino logger the handlers use; injectable so tests can read what would be logged. */
export interface LogSink {
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

const MAX_SCRUB_DEPTH = 6;

/**
 * Copy a log payload with every URL reduced to `scheme://host`. Error messages
 * from ethers embed the request URL (and so the RPC key), and a heartbeat URL
 * carries its token, so every string field is scrubbed, not only the known ones.
 * Errors become `{ name, message, code }`: their other fields (`info`, `url`,
 * `request`) are exactly where the URL is.
 */
export const scrubLogFields = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (typeof value === "string") return redactUrlsInText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_SCRUB_DEPTH || seen.has(value)) return "[omitted]";
  seen.add(value);
  if (value instanceof Error) {
    const code = (value as any).code;
    return {
      name: value.name,
      message: redactUrlsInText(String((value as any).shortMessage ?? value.message)),
      ...(code !== undefined ? { code: String(code) } : {}),
    };
  }
  if (Array.isArray(value)) return value.map((entry) => scrubLogFields(entry, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = scrubLogFields(entry, depth + 1, seen);
  return out;
};

const scrubbingSink = (sink: LogSink): LogSink => {
  const wrap =
    (level: keyof LogSink) =>
    (obj: unknown, msg?: string): void => {
      const scrubbed = scrubLogFields(obj);
      if (msg === undefined) sink[level](scrubbed);
      else sink[level](scrubbed, redactUrlsInText(msg));
    };
  return { debug: wrap("debug"), info: wrap("info"), warn: wrap("warn"), error: wrap("error") };
};

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

export const configurableInitialize = (emitter: EventEmitter, sink: LogSink = getLogger("Validator")) => {
  const logger = scrubbingSink(sink);
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
  emitter.on(BotEvents.EPOCH_NOT_SETTLED, (epoch: number, finalizedTimestamp: number, epochBoundary: number) => {
    logger.warn({ epoch, finalizedTimestamp, epochBoundary }, `epoch_not_settled`);
  });

  emitter.on(BotEvents.ENV_VALIDATED, (signerAddress: string, chainIds: number[], networks: string[]) => {
    logger.info({ signerAddress, chainIds, networks }, `env_validated`);
  });

  emitter.on(BotEvents.ENV_WARNING, (warning: string) => {
    logger.warn({ warning }, `env_warning`);
  });

  emitter.on(BotEvents.NO_CLAIM_FETCHED, (epoch: number, fromBlock?: number, toBlock?: number) => {
    logger.error({ epoch, fromBlock, toBlock }, `no_claim_fetched`);
  });

  // The outbox reports a claim for this epoch, but the log scan of the window in
  // which it must have been made came back empty. Either the scan window is
  // wrong or the endpoint is not serving the logs it should.
  emitter.on(BotEvents.CLAIMED_LOG_NOT_FOUND, (epoch: number, fromBlock: number, toBlock: number) => {
    logger.error({ epoch, fromBlock, toBlock }, `claimed_log_not_found`);
  });

  emitter.on(BotEvents.CLAIM_LOG_SCAN_FAILED, (epoch: number, reason?: string) => {
    logger.warn({ epoch, reason }, `claim_log_scan_failed`);
  });
  emitter.on(BotEvents.CLAIM_MISMATCH, (epoch: number) => {
    logger.error({ epoch }, `claim_mismatch`);
  });
  emitter.on(BotEvents.FINALITY_ISSUE, (epoch: number) => {
    logger.warn({ epoch }, `finality_issue`);
  });
  emitter.on(BotEvents.FINALITY_ERROR, (message: string) => {
    logger.error({ message }, `finality_error`);
  });

  // RPC fallback logs
  // One payload object per event, see botEvents.ts.
  emitter.on(BotEvents.EPOCH_FAILED, (payload: EpochFailedPayload) => logger.error(payload, "epoch_failed"));
  emitter.on(BotEvents.ROUTE_FAILED, (payload: RouteFailedPayload) => logger.error(payload, "route_failed"));
  emitter.on(BotEvents.HEARTBEAT_FAILED, (payload: HeartbeatFailedPayload) => logger.warn(payload, "heartbeat_failed"));
  emitter.on(BotEvents.SHUTDOWN_REQUESTED, (payload: ShutdownRequestedPayload) =>
    logger.info(payload, "shutdown_requested")
  );
  emitter.on(BotEvents.EPOCH_DROPPED, (payload: EpochDroppedPayload) => logger.debug(payload, "epoch_dropped"));
  emitter.on(BotEvents.FINALITY_FALLBACK, (payload: FinalityFallbackPayload) =>
    logger.warn(payload, "finality_fallback")
  );
  emitter.on(BotEvents.FAILED_RESOLUTION, (payload: FailedResolutionPayload) =>
    logger.error(payload, "failed_resolution")
  );
  emitter.on(BotEvents.ESCAPE_HATCH, (payload: EscapeHatchPayload) => logger.warn(payload, "escape_hatch"));
  emitter.on(BotEvents.CANNOT_FUND, (payload: CannotFundPayload) => logger.error(payload, "cannot_fund"));
  emitter.on(BotEvents.LIVENESS_ALARM, (payload: LivenessAlarmPayload) => logger.warn(payload, "liveness_alarm"));
  emitter.on(BotEvents.ALERT, (payload: AlertPayload) =>
    payload.level === "error" ? logger.error(payload, "alert") : logger.warn(payload, "alert")
  );

  emitter.on(BotEvents.RPC_FAILURE, (data) => {
    logger.error(data, "rpc_failure");
  });
  emitter.on(BotEvents.RPC_RECOVERED, (data) => {
    logger.info(data, "rpc_recovered");
  });
};
