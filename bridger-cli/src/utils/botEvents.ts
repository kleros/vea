export enum BotEvents {
  // Bridger state
  STARTED = "started",
  CHECKING = "checking",
  WAITING = "waiting",

  // Epoch state
  NO_NEW_MESSAGES = "no_new_messages",
  NO_SNAPSHOT = "no_snapshot",
  EPOCH_PASSED = "epoch_passed",

  // Claim state
  CLAIMING = "claiming",
  CHALLENGER_WON_CLAIM = "challenger_won_claim",
  VERFICATION_CANT_START = "verification_cant_started",
  CANT_VERIFY_SNAPSHOT = "cant_verify_snapshot",
  CLAIM_CHALLENGED = "claim_challenged",
  STARTING_VERIFICATION = "starting_verification",
  VERIFYING = "verifying",
  WITHDRAWING = "withdrawing",

  // Transaction state
  TXN_MADE = "txn_made",
  TXN_PENDING = "txn_pending",
  TXN_PENDING_CONFIRMATIONS = "txn_pending_confirmations",
  TXN_FINAL = "txn_final",
  TXN_NOT_FINAL = "txn_not_final",
}
