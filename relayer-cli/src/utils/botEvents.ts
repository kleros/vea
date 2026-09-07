export enum BotEvents {
  // Relayer state
  STARTED = "started",
  WAITING = "waiting",
  EXIT = "exit",

  // Bot health
  EXCEPTION = "exception",
  PROMISE_REJECTION = "promise_rejection",
  ERROR_CONTEXT = "error_context",
  RPC_FAILURE = "rpc_failure",
  RPC_RECOVERED = "rpc_recovered",

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
  HASHI_NOT_CONFIGURED = "hashi_not_configured",
  HASHI_MESSAGE_FAILING = "hashi_message_failing",
  HASHI_BATCH_FAILED = "hashi_batch_failed",
  INDEXING = "indexing",
  ENVIO_INDEXING = "envio_indexing",
  ENVIO_FAILED = "envio_failed",
  ROUTE_FAILED = "route_failed",
}
