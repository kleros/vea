import { JsonRpcProvider } from "@ethersproject/providers";
import { VeaInboxArbToEth, VeaOutboxArbToEthDevnet } from "@kleros/vea-contracts/typechain-types";
import {
  ArbToEthTransactionHandler,
  ContractType,
  TransactionStatus,
  Transactions,
  Transaction,
  TransactionHandlerConstructor,
} from "./transactionHandler";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";

type DevnetTransactions = Transactions & {
  devnetAdvanceStateTxn: Transaction | null;
};

export class ArbToEthDevnetTransactionHandler extends ArbToEthTransactionHandler {
  public veaOutboxDevnet: VeaOutboxArbToEthDevnet;
  public transactions: DevnetTransactions = {
    claimTxn: null,
    withdrawClaimDepositTxn: null,
    startVerificationTxn: null,
    verifySnapshotTxn: null,
    challengeTxn: null,
    withdrawChallengeDepositTxn: null,
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
    this.veaOutboxDevnet = this.veaOutbox as VeaOutboxArbToEthDevnet;
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
    const estimateGas = await this.veaOutbox["devnetAdvanceState(uint256,bytes32)"].estimateGas(this.epoch, this.claim);
    const startVerifTrx = await this.veaOutboxDevnet.devnetAdvanceState(this.epoch, stateRoot, {
      gasLimit: estimateGas.mul(2),
    });
    this.emitter.emit(BotEvents.TXN_MADE, startVerifTrx.hash, this.epoch, "Advance Devnet State");
    this.transactions.devnetAdvanceStateTxn = {
      hash: startVerifTrx.hash,
      broadcastedTimestamp: currentTime,
    };
  }
}
