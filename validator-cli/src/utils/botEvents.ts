export enum BotEvents {
  // Bridger state
  STARTED = "started",
  CHECKING = "checking",
  WAITING = "waiting",
  NO_CLAIM = "no_claim",
  VALID_CLAIM = "valid_claim",

  // Epoch state
  NO_NEW_MESSAGES = "no_new_messages",
  NO_SNAPSHOT = "no_snapshot",
  EPOCH_PASSED = "epoch_passed",

  // Claim state
  CHALLENGING = "challenging",
  CHALLENGER_WON_CLAIM = "challenger_won_claim",
  SENDING_SNAPSHOT = "sending_snapshot",
  EXECUTING_SNAPSHOT = "executing_snapshot",
  CANT_EXECUTE_SNAPSHOT = "CANT_EXECUTE_SNAPSHOT",
  WITHDRAWING = "withdrawing",
  WAITING_ARB_TIMEOUT = "waiting_arb_timeout",

  // Transaction state
  TXN_MADE = "txn_made",
  TXN_PENDING = "txn_pending",
  TXN_PENDING_CONFIRMATIONS = "txn_pending_confirmations",
  TXN_FINAL = "txn_final",
  TXN_NOT_FINAL = "txn_not_final",
}
