export enum BotEvents {
  // Bridger state
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
}
