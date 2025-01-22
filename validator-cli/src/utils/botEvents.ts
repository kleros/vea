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
  CLAIM_EPOCH_PASSED = "claim_epoch_passed",

  // Claim state
  CLAIMING = "claiming",
  STARTING_VERIFICATION = "starting_verification",
  VERIFICATION_CANT_START = "verification_cant_start",
  VERIFYING_SNAPSHOT = "verifying_snapshot",
  CANT_VERIFY_SNAPSHOT = "cant_verify_snapshot",
  CHALLENGING = "challenging",
  CHALLENGER_WON_CLAIM = "challenger_won_claim",
  SENDING_SNAPSHOT = "sending_snapshot",
  EXECUTING_SNAPSHOT = "executing_snapshot",
  CANT_EXECUTE_SNAPSHOT = "cant_execute_snapshot",
  WITHDRAWING_CHALLENGE_DEPOSIT = "withdrawing_challenge_deposit",
  WITHDRAWING_CLAIM_DEPOSIT = "withdrawing_claim_deposit",
  WAITING_ARB_TIMEOUT = "waiting_arb_timeout",

  // Transaction state
  TXN_MADE = "txn_made",
  TXN_PENDING = "txn_pending",
  TXN_PENDING_CONFIRMATIONS = "txn_pending_confirmations",
  TXN_FINAL = "txn_final",
  TXN_NOT_FINAL = "txn_not_final",
}
