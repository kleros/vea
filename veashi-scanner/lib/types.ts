import type { SelectProps as AriaSelectProps } from "react-aria-components";

export type Bridge = "CCIP" | "LayerZero" | "Vea" | "DeBridge";

export interface BridgeStatus {
  name: Bridge;
  completed: boolean;
  timestamp?: number;
}

export interface Message {
  txHash: string;
  /** EIP-155 chain ID (e.g. 1 = Ethereum, 42161 = Arbitrum) */
  sourceChain: number;
  /** EIP-155 chain ID */
  destinationChain: number;
  thresholdCurrent?: number;
  thresholdRequired: number;
  bridges?: Bridge[];
  bridgeStatuses?: BridgeStatus[];
  sourceAddress: string;
  destinationAddress: string;
  blockNumber: number;
  /** Unix timestamp (seconds) of the block — used for cross-chain time ordering. */
  blockTimestamp?: number;
  // ── Raw Hashi message fields (populated when full detail is available) ──
  messageId?: string;
  /** Adapter contract addresses from the Hashi message */
  adapters?: string[];
  /** Reporter contract addresses from the Hashi message */
  reporters?: string[];
  /** Message nonce */
  nonce?: number;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalMessages: number;
  blockRangeStart: number;
  blockRangeEnd: number;
}

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

export interface BlockRange {
  chain: string;
  start: number;
  end: number;
  windowSize: number;
}

export interface MessageStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
}

export type IconType = "route" | "address" | "threshold" | "info" | "bridge";

export const NO_CHAIN = "No Chain" as const;
export type ChainFilter = number | typeof NO_CHAIN;

export type ChainItem = {
  id: string | number;
  text: string;
  itemValue: ChainFilter;
};

export type DropdownSelectProps = AriaSelectProps<ChainItem> & {
  items: ChainItem[];
  callback: (value: ChainItem) => void;
  simpleButton?: boolean;
  smallButton?: boolean;
  label?: string;
  dropdownClassName?: string;
};

export type StatusesRecord = Record<string, Status>;

export enum Status {
  PENDING = "Pending",
  IN_PROGRESS = "In Progress",
  CONFIRMED = "Confirmed",
}
