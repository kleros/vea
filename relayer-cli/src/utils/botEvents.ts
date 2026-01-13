export enum BotEvents {
  // Relayer state
  STARTED = "started",
  WAITING = "waiting",
  EXIT = "exit",

  // Bot health
  EXCEPTION = "exception",
  PROMISE_REJECTION = "promise_rejection",

  // Lock file
  LOCK_CLAIMED = "lock_claimed",
  LOCK_DIRECTORY = "lock_directory",
  LOCK_RELEASED = "lock_released",

  // Message relay
  RELAY_BATCH = "relay_batch",
  RELAY_ALL_FROM = "relay_all_from",
  MESSAGE_EXECUTION_FAILED = "message_execution_failed",

  // Hashi executor
  EXECUTING_HASHI = "executing_hashi",
  HASHI_EXECUTED = "hashi_executed",
  HASHI_BATCH_TXN = "hashi_batch_txn",
  HASHI_EXECUTION_FAILED = "hashi_execution_failed",
  HASHI_NOT_CONFIGURED = "hashi_not_configured",
}
