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

export type VeaNonceToHashiMessage = {
  nonce: number;
  hashiMessage: HashiMessage;
  executed: boolean;
};

export enum HashiExecutionStatus {
  THRESHOLD_NOT_MET = "THRESHOLD_NOT_MET",
  EXECUTABLE = "EXECUTABLE",
  EXECUTED = "EXECUTED",
}
