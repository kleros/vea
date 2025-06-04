import {
  VeaInboxArbToGnosis,
  VeaOutboxArbToGnosis,
  VeaOutboxArbToGnosisDevnet,
} from "@kleros/vea-contracts/typechain-types";
import { JsonRpcProvider } from "@ethersproject/providers";
import {
  BaseTransactionHandler,
  BaseTransactionHandlerConstructor,
  ContractType,
  TransactionStatus,
  Transaction,
  Transactions,
} from "./baseTransactionHandler";
import { BotEvents } from "../botEvents";
import { ClaimNotSetError } from "../errors";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { getWETH, getWallet } from "../ethers";
import { messageExecutor } from "../arbMsgExecutor";

export class ArbToGnosisTransactionHandler extends BaseTransactionHandler<VeaInboxArbToGnosis, VeaOutboxArbToGnosis> {
  constructor(opts: BaseTransactionHandlerConstructor) {
    super(opts);
  }

  public async approveWeth(): Promise<void> {
    const { depositToken, outboxRPC, routeConfig } = getBridgeConfig(this.chainId);
    const { veaOutbox, deposit } = routeConfig[this.network];
    const privateKey = process.env.PRIVATE_KEY!;
    const signer = getWallet(privateKey, outboxRPC);

    const weth = getWETH(depositToken, privateKey, outboxRPC);
    const currentAllowance: bigint = await weth.allowance(signer.address, veaOutbox.address);
    if (currentAllowance < deposit) {
      const approvalAmount = deposit * BigInt(1); // Approving for 10 claims
      const approveTx = await weth.approve(routeConfig[Network.TESTNET].veaOutbox.address, deposit * approvalAmount);
      await approveTx.wait();
    }
  }

  public async makeClaim(stateRoot: string): Promise<void> {
    this.emitter.emit(BotEvents.CLAIMING, this.epoch);
    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.claimTxn, ContractType.OUTBOX, now);
    if (status !== TransactionStatus.NOT_MADE && status !== TransactionStatus.EXPIRED) return;

    // Approves WETH for the claim if not already approved
    await this.approveWeth();

    const gasEstimate = await this.veaOutbox["claim(uint256,bytes32)"].estimateGas(this.epoch, stateRoot);
    const tx = await this.veaOutbox.claim(this.epoch, stateRoot, { gasLimit: gasEstimate });
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Claim");
    this.transactions.claimTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }

  public async challengeClaim(): Promise<void> {
    this.emitter.emit(BotEvents.CHALLENGING, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();
    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.challengeTxn, ContractType.OUTBOX, now);
    if (status !== TransactionStatus.NOT_MADE && status !== TransactionStatus.EXPIRED) return;

    const gasEstimate: bigint = await this.veaOutbox[
      "challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim);
    const { routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[this.network];
    const maxFeePerGasProfitable = deposit / (gasEstimate * BigInt(6));
    // Set a reasonable maxPriorityFeePerGas but ensure it's lower than maxFeePerGas
    let maxPriorityFeePerGasMEV = BigInt(6667000000000); // 6667 gwei
    // Ensure maxPriorityFeePerGas <= maxFeePerGas
    if (maxPriorityFeePerGasMEV > maxFeePerGasProfitable) {
      maxPriorityFeePerGasMEV = maxFeePerGasProfitable;
    }
    const tx = await this.veaOutbox.challenge(this.epoch, this.claim, {
      maxFeePerGas: maxFeePerGasProfitable,
      maxPriorityFeePerGas: maxPriorityFeePerGasMEV,
      gasLimit: gasEstimate,
    });
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Challenge");
    this.transactions.challengeTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }

  public async sendSnapshot(): Promise<void> {
    this.emitter.emit(BotEvents.SENDING_SNAPSHOT, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();
    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.sendSnapshotTxn, ContractType.INBOX, now);
    if (status !== TransactionStatus.NOT_MADE && status !== TransactionStatus.EXPIRED) return;

    const ambGasLimit = BigInt(3000000);
    const tx = await this.veaInbox.sendSnapshot(this.epoch, ambGasLimit, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Send Snapshot");
    this.transactions.sendSnapshotTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }

  public async resolveChallengedClaim(sendSnapshotTxn: string): Promise<void> {
    this.emitter.emit(BotEvents.EXECUTING_SNAPSHOT, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();
    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.executeSnapshotTxn!, ContractType.ROUTER, now);
    if (status !== TransactionStatus.NOT_MADE && status !== TransactionStatus.EXPIRED) return;
    const msgExecuteTrnx = await messageExecutor(sendSnapshotTxn, this.veaInboxProvider, this.veaRouterProvider);
    this.emitter.emit(BotEvents.TXN_MADE, msgExecuteTrnx.hash, this.epoch, "Execute Snapshot");
    this.transactions.executeSnapshotTxn = {
      hash: msgExecuteTrnx.hash,
      broadcastedTimestamp: now,
    };
  }
}

/**
 * Devnet-only extension for Arb→Gnosis handler
 */
export interface GnosisDevnetTransactions extends Transactions {
  devnetAdvanceStateTxn: Transaction | null;
}

export class ArbToGnosisDevnetTransactionHandler extends ArbToGnosisTransactionHandler {
  public veaOutboxDevnet: VeaOutboxArbToGnosisDevnet;
  public transactions: GnosisDevnetTransactions = {
    ...(this.transactions as Transactions),
    devnetAdvanceStateTxn: null,
  };

  constructor(opts: BaseTransactionHandlerConstructor) {
    super(opts);
    this.veaOutboxDevnet = opts.veaOutbox as VeaOutboxArbToGnosisDevnet;
  }

  /**
   * Advance the devnet state via a special call on the Devnet outbox.
   */
  public async devnetAdvanceState(stateRoot: string): Promise<void> {
    this.emitter.emit(BotEvents.ADV_DEVNET, this.epoch);
    const now = Date.now();
    const status = await this.checkTransactionStatus(this.transactions.devnetAdvanceStateTxn, ContractType.OUTBOX, now);
    if (status !== TransactionStatus.NOT_MADE && status !== TransactionStatus.EXPIRED) return;
    await this.approveWeth();
    const { routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[Network.DEVNET];
    const tx = await this.veaOutboxDevnet.devnetAdvanceState(this.epoch, stateRoot, {
      value: deposit,
    });
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Advance Devnet State");
    this.transactions.devnetAdvanceStateTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }
}
