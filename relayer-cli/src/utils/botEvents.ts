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
}
