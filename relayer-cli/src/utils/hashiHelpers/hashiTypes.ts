// Numeric fields are numbers on the Envio path and bigints on the RPC log path (and after the state file revives them).
export interface HashiMessage {
  nonce: number | bigint;
  sender: string;
  targetChainId: number | bigint;
  receiver: string;
  threshold: number | bigint;
  data: string;
  reporters: string[];
  adapters: string[];
}

export type HashiMessageState = {
  hashiMessage: HashiMessage;
  executable: boolean;
  status: HashiExecutionStatus;
};

export type HashiMessageExecutionVars = {
  txHash: string;
  timestamp: number;
  blockNumber: number;
  messageId: bigint;
  message: HashiMessage;
};

export type DispatchedTxnData = { txns: HashiMessageExecutionVars[]; toBlock: number };

export enum HashiExecutionStatus {
  THRESHOLD_NOT_MET = "THRESHOLD_NOT_MET",
  EXECUTABLE = "EXECUTABLE",
  EXECUTED = "EXECUTED",
}
