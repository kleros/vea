import {
  VeaInboxArbToGnosis,
  VeaOutboxArbToGnosis,
  VeaOutboxArbToGnosisDevnet,
} from "../../../../contracts/typechain-types";
import { toBigInt, Wallet } from "ethers";
import {
  BaseTransactionHandler,
  BaseTransactionHandlerConstructor,
  CannotFundError,
  ContractType,
  Transaction,
  Transactions,
} from "./baseTransactionHandler";
import { BotEvents } from "../botEvents";
import { ClaimNotSetError } from "../errors";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { getWETH } from "../ethers";
import { messageExecutor } from "../arbMsgExecutor";

/** The longest a WETH approval's receipt is awaited before the cycle moves on. */
export const APPROVAL_RECEIPT_TIMEOUT_MS = 3 * 60 * 1000;

/** Routes and epochs (`${chainId}_${network}_${epoch}`) whose `NONCE_STUCK` alert is out. */
const nonceStuckAlerted = new Set<string>();

/** Test-only: forget which `NONCE_STUCK` alerts were emitted. */
export const resetNonceStuckAlerts = (): void => nonceStuckAlerted.clear();

/** Resolve true once `tx` is mined, false when `timeoutMs` passes first. A revert still throws. */
const waitWithBound = async (
  tx: { wait: (confirms?: number, timeout?: number) => Promise<unknown> },
  timeoutMs: number
): Promise<boolean> => {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  // ethers rejects with code TIMEOUT once its own bound passes; treat that like ours.
  const mined = tx.wait(1, timeoutMs).then(
    () => true as const,
    (err: any) => {
      if (err?.code === "TIMEOUT") return false as const;
      throw err;
    }
  );
  try {
    return await Promise.race([mined, timedOut]);
  } finally {
    clearTimeout(timer);
  }
};

export class ArbToGnosisTransactionHandler extends BaseTransactionHandler<VeaInboxArbToGnosis, VeaOutboxArbToGnosis> {
  constructor(opts: BaseTransactionHandlerConstructor) {
    super(opts);
  }

  /**
   * Make sure the outbox may pull the deposit: returns true when the WETH allowance covers it,
   * false when an approval is still outstanding (the caller sends nothing this cycle).
   * Never blocks the bot on a stuck approval:
   *   - an allowance that already covers the deposit sends nothing;
   *   - while the signer's `pending` nonce is above its `latest` nonce (an earlier approval, or
   *     any other transaction of ours, is still unmined) no second approval is sent and
   *     `ALERT` `NONCE_STUCK` is emitted once per route and epoch while that lasts;
   *   - the approval's receipt is awaited for at most `APPROVAL_RECEIPT_TIMEOUT_MS`.
   * Replacing a stuck transaction with a gas-bumped one is not done (deferred).
   */
  public async approveWeth(action = "approval"): Promise<boolean> {
    const { depositToken, routeConfig } = getBridgeConfig(this.chainId);
    const { veaOutbox, deposit } = routeConfig[this.network];
    const signer = this.veaOutbox.runner as Wallet;
    const weth = getWETH(depositToken, signer);
    if (toBigInt(await weth.allowance(signer.address, veaOutbox.address)) >= deposit) return true;

    const routeEpoch = `${this.chainId}_${this.network}_${this.epoch}`;
    const [pendingNonce, latestNonce] = await Promise.all([
      this.veaOutboxProvider.getTransactionCount(signer.address, "pending"),
      this.veaOutboxProvider.getTransactionCount(signer.address, "latest"),
    ]);
    if (pendingNonce > latestNonce) {
      if (!nonceStuckAlerted.has(routeEpoch)) {
        nonceStuckAlerted.add(routeEpoch);
        this.emitter.emit(BotEvents.ALERT, {
          level: "warn",
          code: "NONCE_STUCK",
          chainId: this.chainId,
          network: this.network,
          epoch: this.epoch,
          details: { action, pendingNonce, latestNonce },
        });
      }
      return false;
    }
    nonceStuckAlerted.delete(routeEpoch);

    await this.ensureNativeFunds(`${action} (WETH approval gas)`, {});
    const approveTx = await weth.approve(veaOutbox.address, deposit * BigInt(10)); // Approving for 10 claims
    this.emitter.emit(BotEvents.TXN_MADE, approveTx.hash, this.epoch, "Approve WETH");
    if (!(await waitWithBound(approveTx, APPROVAL_RECEIPT_TIMEOUT_MS))) {
      this.emitter.emit(BotEvents.TXN_PENDING, approveTx.hash);
      return false;
    }
    const allowance = toBigInt(await weth.allowance(signer.address, veaOutbox.address));
    if (allowance < deposit) this.cannotFund(`${action} (WETH allowance)`, deposit, allowance);
    return true;
  }

  /**
   * The Gnosis outbox takes its deposit in WETH through `transferFrom`: check the WETH balance,
   * then the allowance (approving when short; gas is paid in xDAI). Emits `CANNOT_FUND` and
   * throws `CannotFundError` when the deposit cannot be paid; returns false while an approval
   * is outstanding.
   */
  public async ensureWethFunds(action: string): Promise<boolean> {
    const { depositToken, routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[this.network];
    const signer = this.veaOutbox.runner as Wallet;
    const weth = getWETH(depositToken, signer);
    const balance = toBigInt(await weth.balanceOf(signer.address));
    if (balance < deposit) this.cannotFund(`${action} (WETH balance)`, deposit, balance);
    return this.approveWeth(action);
  }

  public async makeClaim(stateRoot: string): Promise<void> {
    this.emitter.emit(BotEvents.CLAIMING, this.epoch);
    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions.claimTxn, ContractType.OUTBOX, now);
    if (!toSubmit) return;

    // Checks the WETH deposit and approves it if not already approved
    if (!(await this.ensureWethFunds("claim"))) return;

    const gasEstimate = await this.veaOutbox["claim(uint256,bytes32)"].estimateGas(this.epoch, stateRoot);
    await this.ensureNativeFunds("claim", { gasLimit: toBigInt(gasEstimate) });
    const tx = await this.veaOutbox.claim(this.epoch, stateRoot, { gasLimit: gasEstimate });
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Claim");
    this.transactions.claimTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }

  public async challengeClaim(): Promise<void> {
    this.emitter.emit(BotEvents.CHALLENGING, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();
    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions.challengeTxn, ContractType.OUTBOX, now);
    if (!toSubmit) return;

    // `challenge` pulls the deposit with transferFrom, so it needs the allowance as much as a claim does.
    if (!(await this.ensureWethFunds("challenge"))) return;
    const gasEstimate = await this.veaOutbox[
      "challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim);
    const { routeConfig } = getBridgeConfig(this.chainId);
    const { deposit } = routeConfig[this.network];
    const maxFeePerGasProfitable = deposit / (toBigInt(gasEstimate) * BigInt(6));
    // Set a reasonable maxPriorityFeePerGas but ensure it's lower than maxFeePerGas
    let maxPriorityFeePerGasMEV = BigInt(6667000000000); // 6667 gwei
    // Ensure maxPriorityFeePerGas <= maxFeePerGas
    if (maxPriorityFeePerGasMEV > maxFeePerGasProfitable) {
      maxPriorityFeePerGasMEV = maxFeePerGasProfitable;
    }
    await this.ensureNativeFunds("challenge", {
      gasLimit: toBigInt(gasEstimate),
      maxFeePerGas: maxFeePerGasProfitable,
    });
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
    const toSubmit = await this.toSubmitTransaction(this.transactions.sendSnapshotTxn, ContractType.INBOX, now);
    if (!toSubmit) return;

    const ambGasLimit = BigInt(3000000);
    const tx = await this.veaInbox.sendSnapshot(this.epoch, ambGasLimit, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Send Snapshot");
    this.transactions.sendSnapshotTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }

  public async resolveChallengedClaim(sendSnapshotTxn: string): Promise<void> {
    this.emitter.emit(BotEvents.EXECUTING_SNAPSHOT, this.epoch);
    if (!this.claim) throw new ClaimNotSetError();
    const now = Date.now();
    const toSubmit = await this.toSubmitTransaction(this.transactions.executeSnapshotTxn, ContractType.ROUTER, now);
    if (!toSubmit) return;
    if (!this.veaRouterProvider) throw new Error("No router provider: cannot execute the snapshot on L1");
    // The L1 execution is paid by our address on the router's chain (Sepolia). The balance check
    // only raises CANNOT_FUND early: a real shortfall stops here, but a balance read that fails
    // or is unavailable must not block the execution, which reverts on its own if unfunded.
    try {
      await this.ensureNativeFunds("execute snapshot (router)", {}, this.veaRouterProvider);
    } catch (error) {
      if (error instanceof CannotFundError) throw error;
      this.emitter.emit(BotEvents.ALERT, {
        level: "warn",
        code: "ROUTER_BALANCE_UNKNOWN",
        chainId: this.chainId,
        network: this.network,
        epoch: this.epoch,
        details: { message: (error as Error)?.message },
      });
    }
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
    const toSubmit = await this.toSubmitTransaction(this.transactions.devnetAdvanceStateTxn, ContractType.OUTBOX, now);
    if (!toSubmit) return;
    if (!(await this.approveWeth("devnet advance state"))) return;
    // The deposit is paid in WETH by `claim`; `devnetAdvanceState` ignores msg.value.
    const tx = await this.veaOutboxDevnet.devnetAdvanceState(this.epoch, stateRoot);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Advance Devnet State");
    this.transactions.devnetAdvanceStateTxn = { hash: tx.hash, broadcastedTimestamp: now };
  }
}
