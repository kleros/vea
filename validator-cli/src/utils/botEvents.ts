export enum BotEvents {
  // Bridger state
  STARTED = "started",
  ENV_VALIDATED = "env_validated",
  ENV_WARNING = "env_warning",
  WATCHING = "watching",
  CHECKING = "checking",
  WAITING = "waiting",
  NO_CLAIM = "no_claim",
  VALID_CLAIM = "valid_claim",
  NO_CLAIM_REQUIRED = "no_claim_required",

  // Epoch state
  NO_NEW_MESSAGES = "no_new_messages",
  NO_SNAPSHOT = "no_snapshot",
  CLAIM_EPOCH_PASSED = "claim_epoch_passed",

  // Snapshot state
  SAVING_SNAPSHOT = "saving_snapshot",
  SNAPSHOT_WAITING = "snapshot_saving",

  // Claim state
  CLAIMING = "claiming",
  STARTING_VERIFICATION = "starting_verification",
  VERIFICATION_CANT_START = "verification_cant_start",
  VERIFYING_SNAPSHOT = "verifying_snapshot",
  CANT_VERIFY_SNAPSHOT = "cant_verify_snapshot",
  CHALLENGING = "challenging",
  CLAIM_CHALLENGED = "claim_challenged",
  CHALLENGER_WON_CLAIM = "challenger_won_claim",
  SENDING_SNAPSHOT = "sending_snapshot",
  EXECUTING_SNAPSHOT = "executing_snapshot",
  CANT_EXECUTE_SNAPSHOT = "cant_execute_snapshot",
  WITHDRAWING_CHALLENGE_DEPOSIT = "withdrawing_challenge_deposit",
  WITHDRAWING_CLAIM_DEPOSIT = "withdrawing_claim_deposit",
  WAITING_ARB_TIMEOUT = "waiting_arb_timeout",
  CLAIM_ALREADY_RESOLVED = "claim_already_resolved",

  // Devnet state
  ADV_DEVNET = "advance_devnet",

  // Transaction state
  TXN_MADE = "txn_made",
  TXN_PENDING = "txn_pending",
  TXN_PENDING_CONFIRMATIONS = "txn_pending_confirmations",
  TXN_FINAL = "txn_final",
  TXN_NOT_FINAL = "txn_not_final",
  TXN_EXPIRED = "txn_expired",

  // Error state
  NO_CLAIM_FETCHED = "no_claim_fetched",
  CLAIMED_LOG_NOT_FOUND = "claimed_log_not_found",
  CLAIM_LOG_SCAN_FAILED = "claim_log_scan_failed",
  CLAIM_MISMATCH = "claim_mismatch",
  FINALITY_ISSUE = "finality_issue",
  EPOCH_NOT_SETTLED = "epoch_not_settled",
  FINALITY_ERROR = "finality_error",

  // RPC fallback state
  RPC_FAILURE = "rpc_failure",
  RPC_RECOVERED = "rpc_recovered",

  // Each of the following takes ONE payload object, typed below.
  EPOCH_FAILED = "epoch_failed", // EpochFailedPayload: an epoch's work threw; the epoch stays watched
  ROUTE_FAILED = "route_failed", // RouteFailedPayload: a whole route's cycle threw; other routes continue
  HEARTBEAT_FAILED = "heartbeat_failed", // HeartbeatFailedPayload
  SHUTDOWN_REQUESTED = "shutdown_requested", // ShutdownRequestedPayload
  EPOCH_DROPPED = "epoch_dropped", // EpochDroppedPayload: the watcher stopped watching an epoch
  FINALITY_FALLBACK = "finality_fallback", // FinalityFallbackPayload: the stall fallback read was used
  FAILED_RESOLUTION = "failed_resolution", // FailedResolutionPayload: the outbox emitted FailedResolution
  ESCAPE_HATCH = "escape_hatch", // EscapeHatchPayload: an escape-hatch state was detected or withdrawn
  CANNOT_FUND = "cannot_fund", // CannotFundPayload: a deposit or gas cannot be paid right now
  LIVENESS_ALARM = "liveness_alarm", // LivenessAlarmPayload
  ALERT = "alert", // AlertPayload: any other condition an operator must see; `code` names it
}

type RouteRef = { chainId: number; network: string };

export interface EpochFailedPayload extends RouteRef {
  epoch: number;
  message: string;
}
export interface RouteFailedPayload extends RouteRef {
  message: string;
}
export interface HeartbeatFailedPayload {
  status: string;
  message: string;
}
export interface ShutdownRequestedPayload {
  signal: string;
}
export interface EpochDroppedPayload extends RouteRef {
  epoch: number;
  reason: string;
}
export interface FinalityFallbackPayload {
  epoch: number;
  inboxBlock: number;
  inboxTimestamp: number;
  l1Confirmations: number;
}
export interface FailedResolutionPayload extends RouteRef {
  epoch: number;
  txHash?: string;
}
export interface EscapeHatchPayload extends RouteRef {
  epoch: number;
  action: "detected" | "withdrawing" | "withdrawn";
  party: "claimer" | "challenger";
}
export interface CannotFundPayload extends RouteRef {
  epoch: number;
  action: string;
  required: string;
  available: string;
}
export interface LivenessAlarmPayload extends RouteRef {
  secondsSinceLastClaim: number;
}
export interface AlertPayload {
  level: "warn" | "error";
  code: string;
  chainId?: number;
  network?: string;
  epoch?: number;
  details?: Record<string, unknown>;
}
