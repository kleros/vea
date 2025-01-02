import { EventEmitter } from "node:events";
import { getBridgeConfig } from "../consts/bridgeRoutes";
import { ClaimStruct } from "./claim";
import { ClaimNotSetError } from "./errors";
import { defaultEmitter } from "./emitter";
import { BotEvents } from "./botEvents";

interface PendingTransactions {
  claim: string | null;
  verifySnapshot: string | null;
  withdrawClaimDeposit: string | null;
  startVerification: string | null;
}

/**
 * Handles transactions for a given veaOutbox and epoch.
 *
 * @param chainId - The chainId of veaOutbox chain
 * @param epoch - The epoch number for which the transactions are being handled
 * @param veaOutbox - The veaOutbox instance to use for sending transactions
 * @param claim - The claim object for the epoch
 * @param fetchBridgeConfig - The function to fetch the bridge config
 * @param emiitter - The event emitter instance to use for emitting events
 * @returns An instance of the TransactionHandler class
 *
 * @example
 * const txHandler = new TransactionHandler(11155111, 240752, veaOutbox, claim);
 * txHandler.sendTransaction(txData);
 */

export class TransactionHandler {
  public epoch: number;
  public veaOutbox: any;
  public chainId: number;
  public claim: ClaimStruct | null;
  public requiredConfirmations: number = 12;
  public emitter: EventEmitter;

  public pendingTransactions: PendingTransactions = {
    claim: null,
    verifySnapshot: null,
    withdrawClaimDeposit: null,
    startVerification: null,
  };

  constructor(chainId: number, epoch: number, veaOutbox: any, claim?: ClaimStruct, emiitter?: EventEmitter) {
    this.epoch = epoch;
    this.veaOutbox = veaOutbox;
    this.chainId = chainId;
    this.claim = claim;
    this.emitter = emiitter || defaultEmitter;
  }

  public async checkTransactionPendingStatus(trnxHash: string | null): Promise<boolean> {
    if (trnxHash == null) {
      return false;
    }

    const receipt = await this.veaOutbox.provider.getTransactionReceipt(trnxHash);

    if (!receipt) {
      this.emitter.emit(BotEvents.TXN_PENDING, trnxHash);
      return true;
    }

    const currentBlock = await this.veaOutbox.provider.getBlock("latest");
    const confirmations = currentBlock.number - receipt.blockNumber;

    if (confirmations >= this.requiredConfirmations) {
      this.emitter.emit(BotEvents.TXN_FINAL, trnxHash, confirmations);
      return false;
    } else {
      this.emitter.emit(BotEvents.TXN_NOT_FINAL, trnxHash, confirmations);
      return true;
    }
  }

  public async makeClaim(stateRoot: string) {
    this.emitter.emit(BotEvents.CLAIMING, this.epoch);
    if (await this.checkTransactionPendingStatus(this.pendingTransactions.claim)) {
      return;
    }
    const { deposit } = getBridgeConfig(this.chainId);

    const estimateGas = await this.veaOutbox.estimateGas.claim(this.epoch, stateRoot, { value: deposit });
    const claimTransaction = await this.veaOutbox.claim(this.epoch, stateRoot, {
      value: deposit,
      gasLimit: estimateGas,
    });
    this.emitter.emit(BotEvents.TXN_MADE, this.epoch, claimTransaction.hash, "Claim");
    this.pendingTransactions.claim = claimTransaction.hash;
  }

  public async startVerification(latestBlockTimestamp: number) {
    this.emitter.emit(BotEvents.STARTING_VERIFICATION, this.epoch);
    if (this.claim == null) {
      throw new ClaimNotSetError();
    }
    if (await this.checkTransactionPendingStatus(this.pendingTransactions.startVerification)) {
      return;
    }

    const bridgeConfig = getBridgeConfig(this.chainId);
    const timeOver =
      latestBlockTimestamp - this.claim.timestampClaimed - bridgeConfig.sequencerDelayLimit - bridgeConfig.epochPeriod;

    if (timeOver < 0) {
      this.emitter.emit(BotEvents.VERFICATION_CANT_START, -1 * timeOver);
      return;
    }
    const estimateGas = await this.veaOutbox.estimateGas.startVerification(this.epoch, this.claim);
    const startVerifTrx = await this.veaOutbox.startVerification(this.epoch, this.claim, { gasLimit: estimateGas });
    this.emitter.emit(BotEvents.TXN_MADE, this.epoch, startVerifTrx.hash, "Start Verification");
    this.pendingTransactions.startVerification = startVerifTrx.hash;
  }

  public async verifySnapshot(latestBlockTimestamp: number) {
    this.emitter.emit(BotEvents.VERIFYING, this.epoch);
    if (this.claim == null) {
      throw new ClaimNotSetError();
    }
    if (await this.checkTransactionPendingStatus(this.pendingTransactions.verifySnapshot)) {
      return;
    }
    const bridgeConfig = getBridgeConfig(this.chainId);

    const timeLeft = latestBlockTimestamp - this.claim.timestampClaimed - bridgeConfig.minChallengePeriod;

    // Claim not resolved yet, check if we can verifySnapshot
    if (timeLeft < 0) {
      this.emitter.emit(BotEvents.CANT_VERIFY_SNAPSHOT, -1 * timeLeft);
      return;
    }
    // Estimate gas for verifySnapshot
    const estimateGas = await this.veaOutbox.estimateGas.verifySnapshot(this.epoch, this.claim);
    const claimTransaction = await this.veaOutbox.verifySnapshot(this.epoch, this.claim, {
      gasLimit: estimateGas,
    });
    this.emitter.emit(BotEvents.TXN_MADE, this.epoch, claimTransaction.hash, "Verify Snapshot");
    this.pendingTransactions.verifySnapshot = claimTransaction.hash;
  }

  public async withdrawClaimDeposit() {
    this.emitter.emit(BotEvents.WITHDRAWING, this.epoch);
    if (await this.checkTransactionPendingStatus(this.pendingTransactions.withdrawClaimDeposit)) {
      return;
    }
    const estimateGas = await this.veaOutbox.estimateGas.withdrawClaimDeposit(this.epoch, this.claim);
    const withdrawTxn = await this.veaOutbox.withdrawClaimDeposit(this.epoch, this.claim, {
      gasLimit: estimateGas,
    });
    this.emitter.emit(BotEvents.TXN_MADE, this.epoch, withdrawTxn.hash, "Withdraw Deposit");
    this.pendingTransactions.withdrawClaimDeposit = withdrawTxn.hash;
  }
}
