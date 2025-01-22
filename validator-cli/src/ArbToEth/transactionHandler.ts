import { VeaInboxArbToEth, VeaOutboxArbToEth } from "@kleros/vea-contracts/typechain-types";
import { ClaimStruct } from "@kleros/vea-contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { JsonRpcProvider } from "@ethersproject/providers";
import { messageExecutor } from "../utils/arbMsgExecutor";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
import { ClaimNotSetError } from "../utils/errors";
import { getBridgeConfig } from "../consts/bridgeRoutes";

/**
 * @file This file contains the logic for handling transactions from Arbitrum to Ethereum.
 * It is responsible for:
 *      challenge() - Challenge a claim on VeaOutbox(ETH).
 *      withdrawChallengeDeposit() - Withdraw the challenge deposit.
 *      sendSnapshot() - Send a snapshot from the VeaInbox(ARB) to the VeaOutox(ETH).
 *      executeSnapshot() - Execute a sent snapshot to resolve dispute in VeaOutbox (ETH).
 */

type Transactions = {
  claimTxn: string | null;
  withdrawClaimDepositTxn: string | null;
  startVerificationTxn: string | null;
  verifySnapshotTxn: string | null;
  challengeTxn: string | null;
  withdrawChallengeDepositTxn: string | null;
  sendSnapshotTxn: string | null;
  executeSnapshotTxn: string | null;
};

enum TransactionStatus {
  NOT_MADE = 0,
  PENDING = 1,
  NOT_FINAL = 2,
  FINAL = 3,
}

export enum ContractType {
  INBOX = "inbox",
  OUTBOX = "outbox",
}

export class ArbToEthTransactionHandler {
  public requiredConfirmations = 10;
  public claim: ClaimStruct | null = null;
  public chainId = 11155111;

  public veaInbox: VeaInboxArbToEth;
  public veaOutbox: VeaOutboxArbToEth;
  public veaInboxProvider: JsonRpcProvider;
  public veaOutboxProvider: JsonRpcProvider;
  public epoch: number;
  public emitter: typeof defaultEmitter;

  public transactions: Transactions = {
    claimTxn: null,
    withdrawClaimDepositTxn: null,
    startVerificationTxn: null,
    verifySnapshotTxn: null,
    challengeTxn: null,
    withdrawChallengeDepositTxn: null,
    sendSnapshotTxn: null,
    executeSnapshotTxn: null,
  };

  constructor(
    epoch: number,
    veaInbox: VeaInboxArbToEth,
    veaOutbox: VeaOutboxArbToEth,
    veaInboxProvider: JsonRpcProvider,
    veaOutboxProvider: JsonRpcProvider,
    emitter: typeof defaultEmitter = defaultEmitter,
    claim: ClaimStruct | null = null
  ) {
    this.epoch = epoch;
    this.veaInbox = veaInbox;
    this.veaOutbox = veaOutbox;
    this.veaInboxProvider = veaInboxProvider;
    this.veaOutboxProvider = veaOutboxProvider;
    this.emitter = emitter;
    this.claim = claim;
  }

  /**
   * Check the status of a transaction.
   *
   * @param trnxHash Transaction hash to check the status of.
   * @param contract Contract type to check the transaction status in.
   *
   * @returns TransactionStatus.
   */
  public async checkTransactionStatus(trnxHash: string | null, contract: ContractType): Promise<TransactionStatus> {
    let provider: JsonRpcProvider;
    if (contract === ContractType.INBOX) {
      provider = this.veaInboxProvider;
    } else if (contract === ContractType.OUTBOX) {
      provider = this.veaOutboxProvider;
    }

    if (trnxHash == null) {
      return TransactionStatus.NOT_MADE;
    }

    const receipt = await provider.getTransactionReceipt(trnxHash);

    if (!receipt) {
      this.emitter.emit(BotEvents.TXN_PENDING, trnxHash);
      return TransactionStatus.PENDING;
    }

    const currentBlock = await provider.getBlock("latest");
    const confirmations = currentBlock.number - receipt.blockNumber;

    if (confirmations >= this.requiredConfirmations) {
      this.emitter.emit(BotEvents.TXN_FINAL, trnxHash, confirmations);
      return TransactionStatus.FINAL;
    }
    this.emitter.emit(BotEvents.TXN_NOT_FINAL, trnxHash, confirmations);
    return TransactionStatus.NOT_FINAL;
  }

  /**
   * Make a claim on the VeaOutbox(ETH).
   *
   * @param snapshot - The snapshot to be claimed.
   */
  public async makeClaim(stateRoot: string) {
    this.emitter.emit(BotEvents.CLAIMING, this.epoch);
    if ((await this.checkTransactionStatus(this.transactions.claimTxn, ContractType.OUTBOX)) > 0) {
      return;
    }
    const { deposit } = getBridgeConfig(this.chainId);

    const estimateGas = await this.veaOutbox["claim(uint256,bytes32)"].estimateGas(this.epoch, stateRoot, {
      value: deposit,
    });
    const claimTransaction = await this.veaOutbox.claim(this.epoch, stateRoot, {
      value: deposit,
      gasLimit: estimateGas,
    });
    this.emitter.emit(BotEvents.TXN_MADE, this.epoch, claimTransaction.hash, "Claim");
    this.transactions.claimTxn = claimTransaction.hash;
  }

  /**
   * Start verification for this.epoch in VeaOutbox(ETH).
   */
  public async startVerification() {
    this.emitter.emit(BotEvents.STARTING_VERIFICATION, this.epoch);
    if (this.claim == null) {
      throw new ClaimNotSetError();
    }
    if ((await this.checkTransactionStatus(this.transactions.startVerificationTxn, ContractType.OUTBOX)) > 0) {
      return;
    }
    const latestBlockTimestamp = (await this.veaOutboxProvider.getBlock("latest")).timestamp;

    const bridgeConfig = getBridgeConfig(this.chainId);
    const timeOver =
      latestBlockTimestamp -
      Number(this.claim.timestampClaimed) -
      bridgeConfig.sequencerDelayLimit -
      bridgeConfig.epochPeriod;

    if (timeOver < 0) {
      this.emitter.emit(BotEvents.VERIFICATION_CANT_START, -1 * timeOver);
      return;
    }
    const estimateGas = await this.veaOutbox[
      "startVerification(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim);
    const startVerifTrx = await this.veaOutbox.startVerification(this.epoch, this.claim, { gasLimit: estimateGas });
    this.emitter.emit(BotEvents.TXN_MADE, this.epoch, startVerifTrx.hash, "Start Verification");
    this.transactions.startVerificationTxn = startVerifTrx.hash;
  }

  /**
   * Verify snapshot for this.epoch in VeaOutbox(ETH).
   */
  public async verifySnapshot() {
    this.emitter.emit(BotEvents.VERIFYING_SNAPSHOT, this.epoch);
    if (this.claim == null) {
      throw new ClaimNotSetError();
    }
    if ((await this.checkTransactionStatus(this.transactions.verifySnapshotTxn, ContractType.OUTBOX)) > 0) {
      return;
    }
    const latestBlockTimestamp = (await this.veaOutboxProvider.getBlock("latest")).timestamp;
    const bridgeConfig = getBridgeConfig(this.chainId);

    const timeLeft = latestBlockTimestamp - Number(this.claim.timestampClaimed) - bridgeConfig.minChallengePeriod;

    // Claim not resolved yet, check if we can verifySnapshot
    if (timeLeft < 0) {
      this.emitter.emit(BotEvents.CANT_VERIFY_SNAPSHOT, -1 * timeLeft);
      return;
    }
    // Estimate gas for verifySnapshot
    const estimateGas = await this.veaOutbox[
      "verifySnapshot(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim);
    const claimTransaction = await this.veaOutbox.verifySnapshot(this.epoch, this.claim, {
      gasLimit: estimateGas,
    });
    this.emitter.emit(BotEvents.TXN_MADE, this.epoch, claimTransaction.hash, "Verify Snapshot");
    this.transactions.verifySnapshotTxn = claimTransaction.hash;
  }

  /**
   * Withdraw the claim deposit.
   *
   */
  public async withdrawClaimDeposit() {
    this.emitter.emit(BotEvents.WITHDRAWING_CLAIM_DEPOSIT, this.epoch);
    if ((await this.checkTransactionStatus(this.transactions.withdrawClaimDepositTxn, ContractType.OUTBOX)) > 0) {
      return;
    }
    const estimateGas = await this.veaOutbox[
      "withdrawClaimDeposit(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim);
    const withdrawTxn = await this.veaOutbox.withdrawClaimDeposit(this.epoch, this.claim, {
      gasLimit: estimateGas,
    });
    this.emitter.emit(BotEvents.TXN_MADE, this.epoch, withdrawTxn.hash, "Withdraw Deposit");
    this.transactions.withdrawClaimDepositTxn = withdrawTxn.hash;
  }

  /**
   * Challenge claim for this.epoch in VeaOutbox(ETH).
   *
   */
  public async challengeClaim() {
    this.emitter.emit(BotEvents.CHALLENGING);
    if (!this.claim) {
      throw new ClaimNotSetError();
    }
    const transactionStatus = await this.checkTransactionStatus(this.transactions.challengeTxn, ContractType.OUTBOX);
    if (transactionStatus > 0) {
      return;
    }
    const { deposit } = getBridgeConfig(this.chainId);
    const gasEstimate: bigint = await this.veaOutbox[
      "challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim, { value: deposit });
    const maxFeePerGasProfitable = deposit / (gasEstimate * BigInt(6));

    // Set a reasonable maxPriorityFeePerGas but ensure it's lower than maxFeePerGas
    let maxPriorityFeePerGasMEV = BigInt(6667000000000); // 6667 gwei

    // Ensure maxPriorityFeePerGas <= maxFeePerGas
    if (maxPriorityFeePerGasMEV > maxFeePerGasProfitable) {
      maxPriorityFeePerGasMEV = maxFeePerGasProfitable;
    }

    const challengeTxn = await this.veaOutbox[
      "challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ](this.epoch, this.claim, {
      maxFeePerGas: maxFeePerGasProfitable,
      maxPriorityFeePerGas: maxPriorityFeePerGasMEV,
      value: deposit,
      gasLimit: gasEstimate,
    });
    this.emitter.emit(BotEvents.TXN_MADE, challengeTxn.hash, this.epoch, "Challenge");
    this.transactions.challengeTxn = challengeTxn.hash;
  }

  /**
   * Withdraw the challenge deposit.
   *
   */
  public async withdrawChallengeDeposit() {
    this.emitter.emit(BotEvents.WITHDRAWING_CHALLENGE_DEPOSIT);
    if (!this.claim) {
      throw new ClaimNotSetError();
    }
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.withdrawChallengeDepositTxn,
      ContractType.OUTBOX
    );
    if (transactionStatus > 0) {
      return;
    }
    const withdrawDepositTxn = await this.veaOutbox.withdrawChallengeDeposit(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, withdrawDepositTxn.hash, this.epoch, "Withdraw");
    this.transactions.withdrawChallengeDepositTxn = withdrawDepositTxn.hash;
  }

  /**
   * Send a snapshot from the VeaInbox(ARB) to the VeaOutox(ETH).
   */
  public async sendSnapshot() {
    this.emitter.emit(BotEvents.SENDING_SNAPSHOT, this.epoch);
    if (!this.claim) {
      throw new ClaimNotSetError();
    }
    const transactionStatus = await this.checkTransactionStatus(this.transactions.sendSnapshotTxn, ContractType.INBOX);
    if (transactionStatus > 0) {
      return;
    }
    const sendSnapshotTxn = await this.veaInbox.sendSnapshot(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, sendSnapshotTxn.hash, this.epoch, "Send Snapshot");
    this.transactions.sendSnapshotTxn = sendSnapshotTxn.hash;
  }

  /**
   * Execute a sent snapshot to resolve dispute in VeaOutbox (ETH).
   */
  public async resolveChallengedClaim(sendSnapshotTxn: string, executeMsg: typeof messageExecutor = messageExecutor) {
    this.emitter.emit(BotEvents.EXECUTING_SNAPSHOT, this.epoch);
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.executeSnapshotTxn,
      ContractType.OUTBOX
    );
    if (transactionStatus > 0) {
      return;
    }
    const msgExecuteTrnx = await executeMsg(sendSnapshotTxn, this.veaInboxProvider, this.veaOutboxProvider);
    this.emitter.emit(BotEvents.TXN_MADE, msgExecuteTrnx.hash, this.epoch, "Execute Snapshot");
    this.transactions.executeSnapshotTxn = msgExecuteTrnx.hash;
  }
}
