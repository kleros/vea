export interface HashiMessage {
  nonce: number;
  sender: string;
  targetChainId: number;
  receiver: string;
  threshold: number;
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
