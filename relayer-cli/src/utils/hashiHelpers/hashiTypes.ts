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
  executed: boolean;
};

export type HashiMessageExecutionVars = {
  txHash: string;
  blockNumber: number;
  messageId: bigint;
  message: HashiMessage;
};

export enum HashiExecutionStatus {
  THRESHOLD_NOT_MET = "THRESHOLD_NOT_MET",
  EXECUTABLE = "EXECUTABLE",
  EXECUTED = "EXECUTED",
}
