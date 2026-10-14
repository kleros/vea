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
  /* Optional so hand-written handler mocks stay valid; every concrete handler implements them. */
  isBridgeShutdown?(): Promise<boolean>;
  getSignerAddress?(): string | undefined;
  withdrawClaimerEscapeHatch?(): Promise<void>;
  withdrawChallengerEscapeHatch?(): Promise<void>;
}

/**
 * Thrown by a handler that declined to send because the bot cannot pay for the transaction
 * (deposit, WETH allowance or gas). `CANNOT_FUND` has already been emitted when it is thrown.
 */
export class CannotFundError extends Error {
  constructor(action: string) {
    super();
    this.name = "CannotFundError";
    this.message = `Cannot fund ${action}`;
  }
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
  claimerEscapeHatchTxn?: Transaction | null;
  challengerEscapeHatchTxn?: Transaction | null;
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
    claimerEscapeHatchTxn: null,
    challengerEscapeHatchTxn: null,
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

  /** The address the outbox contract is connected with: our claimer / challenger address. */
  public getSignerAddress(): string | undefined {
    return (this.veaOutbox as any)?.runner?.address;
  }

  /**
   * The contract's own timeout rule (`OnlyBridgeShutdown`):
   * `block.timestamp / epochPeriod - latestVerifiedEpoch > timeoutEpochs`, evaluated at the
   * outbox chain's latest block, which is the earliest block a transaction can land in.
   * Shutdown is permanent: `latestVerifiedEpoch` only moves through calls the shutdown blocks.
   */
  public async isBridgeShutdown(): Promise<boolean> {
    const outbox = this.veaOutbox as any;
    // Both are immutable in the outbox contracts.
    this.timeoutParams ??= await Promise.all([outbox.timeoutEpochs(), outbox.epochPeriod()]).then(
      ([timeoutEpochs, epochPeriod]) => ({ timeoutEpochs: BigInt(timeoutEpochs), epochPeriod: BigInt(epochPeriod) })
    );
    // The head and `latestVerifiedEpoch` come from the same provider at the same block, so a
    // failover between the two reads cannot pair one endpoint's head with another's state.
    const latestBlock = await this.veaOutboxProvider.getBlock("latest");
    const latestVerifiedEpoch = await this.readOutboxAt("latestVerifiedEpoch", latestBlock.number);
    const { timeoutEpochs, epochPeriod } = this.timeoutParams;
    const epochNow = BigInt(latestBlock.timestamp) / epochPeriod;
    return epochNow - BigInt(latestVerifiedEpoch) > timeoutEpochs;
  }
  private timeoutParams?: { timeoutEpochs: bigint; epochPeriod: bigint };

  /** Read an argument-less outbox view through `veaOutboxProvider`, pinned to `blockNumber`. */
  private async readOutboxAt(method: string, blockNumber: number): Promise<bigint> {
    const outbox = this.veaOutbox as any;
    const address = typeof outbox.target === "string" ? outbox.target : undefined;
    if (!outbox.interface || !address) {
      // A contract without an ABI interface (a hand-written stub): still pin the block.
      return BigInt(await outbox[method]({ blockTag: blockNumber }));
    }
    const data = outbox.interface.encodeFunctionData(method, []);
    const result = await this.veaOutboxProvider.call({ to: address, data }, blockNumber);
    return BigInt(outbox.interface.decodeFunctionResult(method, result)[0]);
  }

  public async withdrawClaimerEscapeHatch(): Promise<void> {
    await this.withdrawEscapeHatch("claimer");
  }

  public async withdrawChallengerEscapeHatch(): Promise<void> {
    await this.withdrawEscapeHatch("challenger");
  }

  private async withdrawEscapeHatch(party: "claimer" | "challenger"): Promise<void> {
    if (!this.claim) throw new ClaimNotSetError();
    const txnKey = party === "claimer" ? "claimerEscapeHatchTxn" : "challengerEscapeHatchTxn";
    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions[txnKey] ?? null, ContractType.OUTBOX, now);
    if (!toSubmit) return;

    const routeRef = { chainId: this.chainId, network: this.network, epoch: this.epoch, party };
    this.emitter.emit(BotEvents.ESCAPE_HATCH, { ...routeRef, action: "withdrawing" });
    const method = party === "claimer" ? "withdrawClaimerEscapeHatch" : "withdrawChallengerEscapeHatch";
    const tx = await (this.veaOutbox as any)[method](this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, `Withdraw ${party} escape hatch`);
    this.transactions[txnKey] = { hash: tx.hash, broadcastedTimestamp: now };
  }

  /**
   * Check, before sending, that the signer can pay `value` plus `gasLimit` at the fee it will
   * pay, on the chain `provider` serves (the outbox chain by default). Emits `CANNOT_FUND` and
   * throws `CannotFundError` when it cannot.
   */
  protected async ensureNativeFunds(
    action: string,
    {
      value = BigInt(0),
      gasLimit = BigInt(0),
      maxFeePerGas,
    }: { value?: bigint; gasLimit?: bigint; maxFeePerGas?: bigint },
    provider: JsonRpcProvider = this.veaOutboxProvider
  ): Promise<void> {
    const address = this.getSignerAddress();
    if (!address) return;
    let feePerGas = maxFeePerGas;
    if (feePerGas === undefined && gasLimit > BigInt(0)) {
      const feeData = await provider.getFeeData();
      const fee = feeData.maxFeePerGas ?? feeData.gasPrice;
      feePerGas = fee == null ? BigInt(0) : BigInt(fee.toString());
    }
    const required = value + gasLimit * (feePerGas ?? BigInt(0));
    const available = BigInt((await provider.getBalance(address)).toString());
    // A send needs gas even when nothing else is known about its price.
    if (available < required || available === BigInt(0)) this.cannotFund(action, required, available);
  }

  protected cannotFund(action: string, required: bigint, available: bigint): never {
    this.emitter.emit(BotEvents.CANNOT_FUND, {
      chainId: this.chainId,
      network: this.network,
      epoch: this.epoch,
      action,
      required: required.toString(),
      available: available.toString(),
    });
    throw new CannotFundError(action);
  }

  public abstract makeClaim(stateRoot: string): Promise<void>;
  public abstract challengeClaim(): Promise<void>;
  public abstract sendSnapshot(): Promise<void>;
  public abstract resolveChallengedClaim(sendSnapshotTxn: string): Promise<void>;
}
