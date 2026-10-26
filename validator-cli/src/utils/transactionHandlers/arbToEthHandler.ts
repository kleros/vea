import { VeaInboxArbToEth, VeaOutboxArbToEth, VeaOutboxArbToEthDevnet } from "../../../../contracts/typechain-types";
import { toBigInt } from "ethers";
import {
  BaseTransactionHandler,
  BaseTransactionHandlerConstructor,
  ContractType,
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

    const toSubmit = await this.toSubmitTransaction(this.transactions.claimTxn, ContractType.OUTBOX, now);
    if (!toSubmit) return;

    const { routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[this.network];
    // Checked before estimating: a short balance makes estimateGas revert with no CANNOT_FUND.
    await this.ensureNativeFunds("claim", { value: deposit });
    // Estimate gas and send claim with deposit
    const gasLimit = await this.veaOutbox["claim(uint256,bytes32)"].estimateGas(this.epoch, stateRoot, {
      value: deposit,
    });
    await this.ensureNativeFunds("claim", { value: deposit, gasLimit: toBigInt(gasLimit) });
    await this.rebroadcastStuck(ContractType.OUTBOX);
    const tx = await this.veaOutbox.claim(this.epoch, stateRoot, {
      value: deposit,
      gasLimit,
    });
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Claim");
    this.transactions.claimTxn = this.recordSent(tx, now, ContractType.OUTBOX);
  }

  /**
   * Challenge an existing claim on the Ethereum outbox.
   */
  public async challengeClaim(): Promise<void> {
    this.emitter.emit(BotEvents.CHALLENGING, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();
    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions.challengeTxn, ContractType.OUTBOX, now);
    if (!toSubmit) return;

    const { routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[this.network];
    await this.ensureNativeFunds("challenge", { value: deposit });
    const gasEstimate = await this.veaOutbox[
      "challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim, { value: deposit });

    await this.rebroadcastStuck(ContractType.OUTBOX);
    // Profit-driven fee cap, lowered to what the balance left after the deposit can pay.
    const overrides = await this.challengeOverrides({
      value: deposit,
      gasLimit: toBigInt(gasEstimate),
      profitCap: deposit / (toBigInt(gasEstimate) * BigInt(6)),
    });

    const tx = await this.sendOrCannotFund(
      "challenge",
      { value: deposit, gasLimit: toBigInt(gasEstimate), maxFeePerGas: overrides.maxFeePerGas },
      () =>
        this.veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
          this.epoch,
          this.claim!,
          {
            ...overrides,
            value: deposit,
            gasLimit: gasEstimate,
          }
        )
    );

    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Challenge");
    this.transactions.challengeTxn = this.recordSent(tx, now, ContractType.OUTBOX);
  }

  /**
   * Send a snapshot from Arbitrum inbox to Ethereum outbox.
   */
  public async sendSnapshot(): Promise<void> {
    this.emitter.emit(BotEvents.SENDING_SNAPSHOT, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();

    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions.sendSnapshotTxn, ContractType.INBOX, now);
    if (!toSubmit) return;

    await this.rebroadcastStuck(ContractType.INBOX);
    const tx = await this.veaInbox.sendSnapshot(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Send Snapshot");
    this.transactions.sendSnapshotTxn = this.recordSent(tx, now, ContractType.INBOX);
  }

  /**
   * Execute a challenged snapshot via the messageExecutor utility.
   */
  public async resolveChallengedClaim(sendSnapshotHash: string, execFn = messageExecutor): Promise<void> {
    this.emitter.emit(BotEvents.EXECUTING_SNAPSHOT, this.epoch);
    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions.executeSnapshotTxn, ContractType.OUTBOX, now);
    if (!toSubmit) return;

    // The L1 execution is paid by our address on the outbox chain (Sepolia).
    await this.ensureNativeFunds("execute snapshot", {});
    await this.rebroadcastStuck(ContractType.OUTBOX);
    const result = await execFn(sendSnapshotHash, this.veaInboxProvider, this.veaOutboxProvider);
    this.emitter.emit(BotEvents.TXN_MADE, result.hash, this.epoch, "Execute Snapshot");
    this.transactions.executeSnapshotTxn = this.recordSent(result, now, ContractType.OUTBOX);
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
    const toSubmit = await this.toSubmitTransaction(this.transactions.devnetAdvanceStateTxn, ContractType.OUTBOX, now);
    if (!toSubmit) return;
    const { routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[Network.DEVNET];
    await this.rebroadcastStuck(ContractType.OUTBOX);
    const tx = await this.veaOutboxDevnet.devnetAdvanceState(this.epoch, stateRoot, {
      value: deposit,
    });
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Advance Devnet State");
    this.transactions.devnetAdvanceStateTxn = this.recordSent(tx, now, ContractType.OUTBOX);
  }
}
