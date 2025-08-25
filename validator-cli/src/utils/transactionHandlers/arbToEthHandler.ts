import { VeaInboxArbToEth, VeaOutboxArbToEth, VeaOutboxArbToEthDevnet } from "@kleros/vea-contracts/typechain-types";
import { toBigInt } from "ethers";
import {
  BaseTransactionHandler,
  BaseTransactionHandlerConstructor,
  ContractType,
  TransactionStatus,
  Transaction,
  Transactions,
} from "./baseTransactionHandler";
import { BotEvents } from "../../utils/botEvents";
import { ClaimNotSetError } from "../../utils/errors";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { messageExecutor } from "../../utils/arbMsgExecutor";

// Handler for Arbitrum → Ethereum claims and snapshots, now leveraging BaseTransactionHandler
export class ArbToEthTransactionHandler extends BaseTransactionHandler<VeaInboxArbToEth, VeaOutboxArbToEth> {
  constructor(opts: BaseTransactionHandlerConstructor) {
    super(opts);
  }

  /**
   * Make a claim on the Ethereum outbox.
   */
  public async makeClaim(stateRoot: string): Promise<void> {
    this.emitter.emit(BotEvents.CLAIMING, this.epoch);
    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.claimTxn, ContractType.OUTBOX, now);
    if (status === TransactionStatus.PENDING || status === TransactionStatus.NOT_FINAL) {
      return;
    }

    const { routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[this.network];
    // Estimate gas and send claim with deposit
    const gasLimit = await this.veaOutbox["claim(uint256,bytes32)"].estimateGas(this.epoch, stateRoot, {
      value: deposit,
    });
    const tx = await this.veaOutbox.claim(this.epoch, stateRoot, {
      value: deposit,
      gasLimit,
    });
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Claim");
    this.transactions.claimTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }

  /**
   * Challenge an existing claim on the Ethereum outbox.
   */
  public async challengeClaim(): Promise<void> {
    this.emitter.emit(BotEvents.CHALLENGING, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();
    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.challengeTxn, ContractType.OUTBOX, now);
    if (status === TransactionStatus.PENDING || status === TransactionStatus.NOT_FINAL) {
      return;
    }

    const { routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[this.network];
    const gasEstimate = await this.veaOutbox[
      "challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim, { value: deposit });

    // Profit-driven fee calculation
    const maxFeePerGas = deposit / (toBigInt(gasEstimate) * BigInt(6));
    let maxPriorityFeePerGas = BigInt(6_667_000_000_000);
    if (maxPriorityFeePerGas > maxFeePerGas) {
      maxPriorityFeePerGas = maxFeePerGas;
    }

    const tx = await this.veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
      this.epoch,
      this.claim,
      {
        maxFeePerGas,
        maxPriorityFeePerGas,
        value: deposit,
        gasLimit: gasEstimate,
      }
    );

    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Challenge");
    this.transactions.challengeTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }

  /**
   * Send a snapshot from Arbitrum inbox to Ethereum outbox.
   */
  public async sendSnapshot(): Promise<void> {
    this.emitter.emit(BotEvents.SENDING_SNAPSHOT, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();

    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.sendSnapshotTxn, ContractType.INBOX, now);
    if (status === TransactionStatus.PENDING || status === TransactionStatus.NOT_FINAL) {
      return;
    }

    const tx = await this.veaInbox.sendSnapshot(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Send Snapshot");
    this.transactions.sendSnapshotTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }

  /**
   * Execute a challenged snapshot via the messageExecutor utility.
   */
  public async resolveChallengedClaim(sendSnapshotHash: string, execFn = messageExecutor): Promise<void> {
    this.emitter.emit(BotEvents.EXECUTING_SNAPSHOT, this.epoch);
    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.executeSnapshotTxn, ContractType.OUTBOX, now);
    if (status === TransactionStatus.PENDING || status === TransactionStatus.NOT_FINAL) {
      return;
    }

    const result = await execFn(sendSnapshotHash, this.veaInboxProvider, this.veaOutboxProvider);
    this.emitter.emit(BotEvents.TXN_MADE, result.hash, this.epoch, "Execute Snapshot");
    this.transactions.executeSnapshotTxn = { hash: result.hash, broadcastedTimestamp: now };
  }
}

// Devnet-only extension
export interface DevnetTransactions extends Transactions {
  devnetAdvanceStateTxn: Transaction | null;
}

export class ArbToEthDevnetTransactionHandler extends ArbToEthTransactionHandler {
  public veaOutboxDevnet: VeaOutboxArbToEthDevnet;
  public transactions: DevnetTransactions = {
    ...this.transactions,
    devnetAdvanceStateTxn: null,
  };

  constructor(opts: BaseTransactionHandlerConstructor) {
    super(opts);
    this.veaOutboxDevnet = opts.veaOutbox as VeaOutboxArbToEthDevnet;
  }

  /**
   * Advance the devnet state via a special call on the Devnet outbox.
   */
  public async devnetAdvanceState(stateRoot: string): Promise<void> {
    this.emitter.emit(BotEvents.ADV_DEVNET, this.epoch);
    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.devnetAdvanceStateTxn, ContractType.OUTBOX, now);
    if (status === TransactionStatus.PENDING || status === TransactionStatus.NOT_FINAL) {
      return;
    }
    const { routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[Network.DEVNET];
    const tx = await this.veaOutboxDevnet.devnetAdvanceState(this.epoch, stateRoot, {
      value: deposit,
    });
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Advance Devnet State");
    this.transactions.devnetAdvanceStateTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }
}
