export type VeaBridgeKey = "arbToEth" | "arbToGnosis";
export type VeaNetwork = "testnet" | "devnet";

export interface VeaRoute {
  bridgeKey: VeaBridgeKey;
  network: VeaNetwork;
  label: string;
  sourceChainId: number;
  destinationChainId: number;
  inboxAddress: string;
  outboxAddress: string;
}

export interface VeaFallback {
  executor: string;
  timestamp?: number;
  txHash: string;
  ticketId: string;
}

export interface VeaSnapshot {
  id: string;
  epoch?: number;
  caller?: string;
  txHash?: string;
  timestamp?: number;
  stateRoot?: string;
  numberMessages: number;
  saved: boolean;
  resolving: boolean;
  fallback: VeaFallback[];
}

export interface VeaChallenge {
  txHash: string;
  timestamp: number;
  challenger: string;
}

export interface VeaVerification {
  startTimestamp?: number;
  startCaller?: string;
  startTxHash?: string;
  verifiedTimestamp?: number;
  verifiedCaller?: string;
  verifiedTxHash?: string;
}

export interface VeaClaim {
  id: string;
  epoch: number;
  stateRoot: string;
  bridger: string;
  timestamp: number;
  txHash: string;
  challenged: boolean;
  verified: boolean;
  challenge: VeaChallenge[];
  verification: VeaVerification[];
}

export type VeaStatus =
  | "Pending"
  | "Saved"
  | "Claimed"
  | "Challenged"
  | "Verifying"
  | "Verified"
  | "Resolved"
  | "Unknown";

export interface VeaEpochRow {
  route: VeaRoute;
  epoch: number;
  snapshot: VeaSnapshot | null;
  claim: VeaClaim | null;
  status: VeaStatus;
}

export interface VeaMessageRow {
  id: string;
  nonce: number;
  txHash: string;
  timestamp: number;
  from: string;
  to: string;
  executed: boolean;
  relayedTxHash?: string;
  relayer?: string;
}
