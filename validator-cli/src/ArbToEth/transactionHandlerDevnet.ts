import { VeaOutboxArbToEthDevnet } from "@kleros/vea-contracts/typechain-types";
import {
  ArbToEthTransactionHandler,
  ContractType,
  TransactionStatus,
  Transactions,
  Transaction,
  TransactionHandlerConstructor,
} from "./transactionHandler";
import { BotEvents } from "../utils/botEvents";
import { getBridgeConfig } from "../consts/bridgeRoutes";

type DevnetTransactions = Transactions & {
  devnetAdvanceStateTxn: Transaction | null;
};

const CHAIN_ID = 11155111;

export class ArbToEthDevnetTransactionHandler extends ArbToEthTransactionHandler {
  public veaOutboxDevnet: VeaOutboxArbToEthDevnet;
  public transactions: DevnetTransactions = {
    claimTxn: null,
    withdrawClaimDepositTxn: null,
    startVerificationTxn: null,
    verifySnapshotTxn: null,
    challengeTxn: null,
    withdrawChallengeDepositTxn: null,
    saveSnapshotTxn: null,
    sendSnapshotTxn: null,
    executeSnapshotTxn: null,
    devnetAdvanceStateTxn: null,
  };
  constructor({
    veaInbox,
    veaOutbox,
    veaInboxProvider,
    veaOutboxProvider,
    epoch,
    emitter,
  }: TransactionHandlerConstructor) {
    super({
      epoch,
      veaInbox,
      veaOutbox,
      veaInboxProvider,
      veaOutboxProvider,
      emitter,
    } as TransactionHandlerConstructor);
    this.veaOutboxDevnet = veaOutbox as VeaOutboxArbToEthDevnet;
  }
  public async devnetAdvanceState(stateRoot: string): Promise<void> {
    this.emitter.emit(BotEvents.ADV_DEVNET, this.epoch);
    const currentTime = Date.now();
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.devnetAdvanceStateTxn,
      ContractType.OUTBOX,
      currentTime
    );
    if (transactionStatus != TransactionStatus.NOT_MADE && transactionStatus != TransactionStatus.EXPIRED) {
      return;
    }
    const deposit = getBridgeConfig(CHAIN_ID).deposit;
    const startVerifTrx = await this.veaOutboxDevnet.devnetAdvanceState(this.epoch, stateRoot, {
      value: deposit,
    });
    this.emitter.emit(BotEvents.TXN_MADE, startVerifTrx.hash, this.epoch, "Advance Devnet State");
    this.transactions.devnetAdvanceStateTxn = {
      hash: startVerifTrx.hash,
      broadcastedTimestamp: currentTime,
    };
  }
}
