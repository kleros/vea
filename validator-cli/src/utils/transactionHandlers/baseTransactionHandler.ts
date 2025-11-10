import { JsonRpcProvider } from "@ethersproject/providers";
import { BotEvents } from "../botEvents";
import { ClaimNotSetError } from "../errors";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { defaultEmitter } from "../emitter";
import { ClaimStruct } from "../../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";

export interface ITransactionHandler {
  /* Public properties */
  chainId: number;
  network: Network;
  epoch: number;
  veaInbox: any;
  veaOutbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutboxProvider: JsonRpcProvider;
  veaRouterProvider?: JsonRpcProvider;
  emitter: typeof defaultEmitter;
  claim: ClaimStruct | null;
  transactions: Transactions;

  /* Public methods */
  checkTransactionStatus(
    trnx: Transaction | null,
    contract: ContractType,
    currentTime: number
  ): Promise<TransactionStatus>;
  makeClaim(stateRoot: string): Promise<void>;
  startVerification(currentTimestamp: number): Promise<void>;
  verifySnapshot(currentTimestamp: number): Promise<void>;
  withdrawClaimDeposit(): Promise<void>;
  challengeClaim(): Promise<void>;
  withdrawChallengeDeposit(): Promise<void>;
  saveSnapshot(): Promise<void>;
  sendSnapshot(): Promise<void>;
  resolveChallengedClaim(sendSnapshotTxn: string): Promise<void>;
  routeSnapshot?(): Promise<void>;
}

export enum ContractType {
  INBOX = "inbox",
  OUTBOX = "outbox",
  ROUTER = "router",
}

export enum TransactionStatus {
  NOT_MADE = 0,
  PENDING = 1,
  NOT_FINAL = 2,
  FINAL = 3,
  EXPIRED = 4,
}

export type Transaction = {
  hash: string;
  broadcastedTimestamp: number;
};

export type Transactions = {
  claimTxn: Transaction | null;
  withdrawClaimDepositTxn: Transaction | null;
  startVerificationTxn: Transaction | null;
  verifySnapshotTxn: Transaction | null;
  challengeTxn: Transaction | null;
  withdrawChallengeDepositTxn: Transaction | null;
  saveSnapshotTxn: Transaction | null;
  sendSnapshotTxn: Transaction | null;
  executeSnapshotTxn: Transaction | null;
  devnetAdvanceStateTxn?: Transaction | null;
};

export const MAX_PENDING_TIME = 5 * 60 * 1000; // 5 minutes
export const MAX_PENDING_CONFIRMATIONS = 10;

export interface BaseTransactionHandlerConstructor {
  chainId: number;
  network: Network;
  epoch: number;
  veaInbox: any;
  veaOutbox: any;
  veaInboxProvider: JsonRpcProvider;
  veaOutboxProvider: JsonRpcProvider;
  veaRouterProvider?: JsonRpcProvider;
  emitter: typeof defaultEmitter;
  claim: ClaimStruct | null;
}

/**
 * Abstract base that implements all of the “status check” logic
 * and the shared handlers:
 *   - startVerification
 *   - verifySnapshot
 *   - withdrawClaimDeposit
 *   - withdrawChallengeDeposit
 *   - saveSnapshot
 *
 * Subclasses must implement:
 *   - makeClaim
 *   - challengeClaim
 *   - sendSnapshot
 *   - resolveChallengedClaim
 *   - (optionally) routeAssets
 */
export abstract class BaseTransactionHandler<Inbox, Outbox> implements ITransactionHandler {
  public chainId: number;
  public network: Network;
  public epoch: number;
  public veaInbox: Inbox;
  public veaOutbox: Outbox;
  public veaInboxProvider: JsonRpcProvider;
  public veaOutboxProvider: JsonRpcProvider;
  public veaRouterProvider?: JsonRpcProvider;
  public emitter: typeof defaultEmitter;
  public claim: ClaimStruct | null;
  public transactions: Transactions = {
    claimTxn: null,
    withdrawClaimDepositTxn: null,
    startVerificationTxn: null,
    verifySnapshotTxn: null,
    challengeTxn: null,
    withdrawChallengeDepositTxn: null,
    saveSnapshotTxn: null,
    sendSnapshotTxn: null,
    executeSnapshotTxn: null,
  };

  constructor({
    chainId,
    network,
    epoch,
    veaInbox,
    veaOutbox,
    veaInboxProvider,
    veaOutboxProvider,
    emitter,
    claim,
    veaRouterProvider,
  }: BaseTransactionHandlerConstructor) {
    this.chainId = chainId;
    this.network = network;
    this.epoch = epoch;
    this.veaInbox = veaInbox;
    this.veaOutbox = veaOutbox;
    this.veaInboxProvider = veaInboxProvider;
    this.veaOutboxProvider = veaOutboxProvider;
    this.veaRouterProvider = veaRouterProvider;
    this.emitter = emitter;
    this.claim = claim;
  }

  public async checkTransactionStatus(
    trnx: Transaction | null,
    contract: ContractType,
    currentTime: number
  ): Promise<TransactionStatus> {
    let provider: JsonRpcProvider;
    switch (contract) {
      case ContractType.INBOX:
        provider = this.veaInboxProvider;
        break;
      case ContractType.OUTBOX:
        provider = this.veaOutboxProvider;
        break;
      case ContractType.ROUTER:
        provider = this.veaRouterProvider;
        break;
    }

    if (!trnx) return TransactionStatus.NOT_MADE;

    const receipt = await provider.getTransactionReceipt(trnx.hash);
    if (!receipt) {
      this.emitter.emit(BotEvents.TXN_PENDING, trnx.hash);
      if (currentTime - trnx.broadcastedTimestamp > MAX_PENDING_TIME) {
        this.emitter.emit(BotEvents.TXN_EXPIRED, trnx.hash);
        return TransactionStatus.EXPIRED;
      }
      return TransactionStatus.PENDING;
    }

    const block = await provider.getBlock("latest");
    const confirmations = block.number - receipt.blockNumber;
    if (confirmations >= MAX_PENDING_CONFIRMATIONS) {
      this.emitter.emit(BotEvents.TXN_FINAL, trnx.hash, confirmations);
      return TransactionStatus.FINAL;
    }

    this.emitter.emit(BotEvents.TXN_NOT_FINAL, trnx.hash, MAX_PENDING_CONFIRMATIONS - confirmations);
    return TransactionStatus.NOT_FINAL;
  }

  public async toSubmitTransaction(
    trnx: Transaction | null,
    contract: ContractType,
    currentTime: number
  ): Promise<boolean> {
    const status = await this.checkTransactionStatus(trnx, contract, currentTime);
    if (status === TransactionStatus.PENDING || status === TransactionStatus.NOT_FINAL) return false;
    return true;
  }

  public async startVerification(currentTimestamp: number) {
    this.emitter.emit(BotEvents.STARTING_VERIFICATION, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();

    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions.startVerificationTxn, ContractType.OUTBOX, now);
    if (!toSubmit) return;

    const cfg = getBridgeConfig(this.chainId);
    const timeOver =
      currentTimestamp -
      Number(this.claim.timestampClaimed) -
      cfg.sequencerDelayLimit -
      cfg.routeConfig[this.network].epochPeriod;

    if (timeOver < 0) {
      this.emitter.emit(BotEvents.VERIFICATION_CANT_START, this.epoch, -timeOver);
      return;
    }

    const tx = await (this.veaOutbox as any).startVerification(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Start Verification");
    this.transactions.startVerificationTxn = {
      hash: tx.hash,
      broadcastedTimestamp: now,
    };
  }

  public async verifySnapshot(currentTimestamp: number) {
    this.emitter.emit(BotEvents.VERIFYING_SNAPSHOT, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();

    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions.verifySnapshotTxn, ContractType.OUTBOX, now);
    if (!toSubmit) return;

    const cfg = getBridgeConfig(this.chainId);
    const timeLeft = currentTimestamp - Number(this.claim.timestampVerification) - cfg.minChallengePeriod;

    if (timeLeft < 0) {
      this.emitter.emit(BotEvents.CANT_VERIFY_SNAPSHOT, this.epoch, -timeLeft);
      return;
    }

    const tx = await (this.veaOutbox as any).verifySnapshot(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Verify Snapshot");
    this.transactions.verifySnapshotTxn = {
      hash: tx.hash,
      broadcastedTimestamp: now,
    };
  }

  public async withdrawClaimDeposit() {
    this.emitter.emit(BotEvents.WITHDRAWING_CLAIM_DEPOSIT, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();

    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(
      this.transactions.withdrawClaimDepositTxn,
      ContractType.OUTBOX,
      now
    );
    if (!toSubmit) return;

    const tx = await (this.veaOutbox as any).withdrawClaimDeposit(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Withdraw Claim Deposit");
    this.transactions.withdrawClaimDepositTxn = {
      hash: tx.hash,
      broadcastedTimestamp: now,
    };
  }

  public async withdrawChallengeDeposit() {
    this.emitter.emit(BotEvents.WITHDRAWING_CHALLENGE_DEPOSIT, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();

    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(
      this.transactions.withdrawChallengeDepositTxn,
      ContractType.OUTBOX,
      now
    );
    if (!toSubmit) return;

    const tx = await (this.veaOutbox as any).withdrawChallengeDeposit(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Withdraw Challenge Deposit");
    this.transactions.withdrawChallengeDepositTxn = {
      hash: tx.hash,
      broadcastedTimestamp: now,
    };
  }

  public async saveSnapshot() {
    this.emitter.emit(BotEvents.SAVING_SNAPSHOT, this.epoch);

    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions.saveSnapshotTxn, ContractType.INBOX, now);
    if (!toSubmit) return;

    const tx = await (this.veaInbox as any).saveSnapshot();
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Save Snapshot");
    this.transactions.saveSnapshotTxn = {
      hash: tx.hash,
      broadcastedTimestamp: now,
    };
  }

  public abstract makeClaim(stateRoot: string): Promise<void>;
  public abstract challengeClaim(): Promise<void>;
  public abstract sendSnapshot(): Promise<void>;
  public abstract resolveChallengedClaim(sendSnapshotTxn: string): Promise<void>;
}
