import { JsonRpcProvider } from "@ethersproject/providers";
import { ContractTransaction } from "@ethersproject/contracts";
import { Signer } from "@ethersproject/abstract-signer";
import {
  VeaInboxArbToEth,
  VeaOutboxArbToGnosisDevnet,
  VeaOutboxArbToEthDevnet,
} from "@kleros/vea-contracts/typechain-types";
import * as Bridges from "./bridges";
import { MessageInfo, getMessageInfo, relay } from "./message";

export type VeaClientConfig = {
  readonly bridge: Bridges.Bridge;
  readonly inboxRpc: string;
  readonly outboxRpc: string;
};

export type VeaInbox = VeaInboxArbToEth;
export type VeaOutbox = VeaOutboxArbToEthDevnet | VeaOutboxArbToGnosisDevnet;

export class VeaClient {
  readonly config: VeaClientConfig;
  inboxProvider: JsonRpcProvider;
  outboxProvider: JsonRpcProvider;
  inbox: VeaInbox;
  outbox: VeaOutbox;

  constructor(
    config: VeaClientConfig,
    inboxProvider: JsonRpcProvider,
    outboxProvider: JsonRpcProvider,
    inbox: VeaInboxArbToEth,
    outbox: VeaOutboxArbToEthDevnet | VeaOutboxArbToGnosisDevnet
  ) {
    this.config = config;
    this.inboxProvider = inboxProvider;
    this.outboxProvider = outboxProvider;
    this.inbox = inbox;
    this.outbox = outbox;
  }

  public getMessageInfo = async (messageId: number): Promise<MessageInfo> => {
    return getMessageInfo(this, messageId);
  };

  public relay = async (messageInfo: MessageInfo, signer: Signer): Promise<ContractTransaction> => {
    return relay(this, messageInfo, signer);
  };
}