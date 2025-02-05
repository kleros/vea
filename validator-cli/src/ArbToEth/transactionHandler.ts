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
 *      makeClaim() - Make a claim on the VeaOutbox(ETH).
 *      startVerification() - Start verification for this.epoch in VeaOutbox(ETH).
 *      verifySnapshot() - Verify snapshot for this.epoch in VeaOutbox(ETH).
 *      withdrawClaimDeposit() - Withdraw the claim deposit.
 *      challenge() - Challenge a claim on VeaOutbox(ETH).
 *      withdrawChallengeDeposit() - Withdraw the challenge deposit.
 *      sendSnapshot() - Send a snapshot from the VeaInbox(ARB) to the VeaOutox(ETH).
 *      executeSnapshot() - Execute a sent snapshot to resolve dispute in VeaOutbox (ETH).
 */

export type Transaction = {
  hash: string;
  broadcastedTimestamp: number;
};

type Transactions = {
  claimTxn: Transaction | null;
  withdrawClaimDepositTxn: Transaction | null;
  startVerificationTxn: Transaction | null;
  verifySnapshotTxn: Transaction | null;
  challengeTxn: Transaction | null;
  withdrawChallengeDepositTxn: Transaction | null;
  sendSnapshotTxn: Transaction | null;
  executeSnapshotTxn: Transaction | null;
};

enum TransactionStatus {
  NOT_MADE = 0,
  PENDING = 1,
  NOT_FINAL = 2,
  FINAL = 3,
  EXPIRED = 4,
}

export enum ContractType {
  INBOX = "inbox",
  OUTBOX = "outbox",
}

export const MAX_PENDING_TIME = 5 * 60 * 1000; // 3 minutes
export const MAX_PENDING_CONFIRMATIONS = 10;
const CHAIN_ID = 11155111;

export class ArbToEthTransactionHandler {
  public claim: ClaimStruct | null = null;

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
  public async checkTransactionStatus(
    trnx: Transaction | null,
    contract: ContractType,
    currentTime: number
  ): Promise<TransactionStatus> {
    const provider = contract === ContractType.INBOX ? this.veaInboxProvider : this.veaOutboxProvider;
    if (trnx == null) {
      return TransactionStatus.NOT_MADE;
    }

    const receipt = await provider.getTransactionReceipt(trnx.hash);

    if (!receipt) {
      this.emitter.emit(BotEvents.TXN_PENDING, trnx.hash);
      if (currentTime - trnx.broadcastedTimestamp > MAX_PENDING_TIME) {
        this.emitter.emit(BotEvents.TXN_EXPIRED, trnx.hash);
        return TransactionStatus.EXPIRED;
      }
      return TransactionStatus.PENDING;
    }

    const currentBlock = await provider.getBlock("latest");
    const confirmations = currentBlock.number - receipt.blockNumber;

    if (confirmations >= MAX_PENDING_CONFIRMATIONS) {
      this.emitter.emit(BotEvents.TXN_FINAL, trnx.hash, confirmations);
      return TransactionStatus.FINAL;
    }
    this.emitter.emit(BotEvents.TXN_NOT_FINAL, trnx.hash, confirmations);
    return TransactionStatus.NOT_FINAL;
  }

  /**
   * Make a claim on the VeaOutbox(ETH).
   *
   * @param snapshot - The snapshot to be claimed.
   */
  public async makeClaim(stateRoot: string) {
    this.emitter.emit(BotEvents.CLAIMING, this.epoch);
    const currentTime = Date.now();
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.claimTxn,
      ContractType.OUTBOX,
      currentTime
    );
    if (transactionStatus != TransactionStatus.NOT_MADE && transactionStatus != TransactionStatus.EXPIRED) {
      return;
    }
    const { deposit } = getBridgeConfig(CHAIN_ID);

    const estimateGas = await this.veaOutbox["claim(uint256,bytes32)"].estimateGas(this.epoch, stateRoot, {
      value: deposit,
    });
    const claimTransaction = await this.veaOutbox.claim(this.epoch, stateRoot, {
      value: deposit,
      gasLimit: estimateGas,
    });
    this.emitter.emit(BotEvents.TXN_MADE, claimTransaction.hash, this.epoch, "Claim");
    this.transactions.claimTxn = {
      hash: claimTransaction.hash,
      broadcastedTimestamp: currentTime,
    };
  }

  /**
   * Start verification for this.epoch in VeaOutbox(ETH).
   */
  public async startVerification(currentTimestamp: number) {
    this.emitter.emit(BotEvents.STARTING_VERIFICATION, this.epoch);
    if (this.claim == null) {
      throw new ClaimNotSetError();
    }
    const currentTime = Date.now();
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.startVerificationTxn,
      ContractType.OUTBOX,
      currentTime
    );
    if (transactionStatus != TransactionStatus.NOT_MADE && transactionStatus != TransactionStatus.EXPIRED) {
      return;
    }

    const bridgeConfig = getBridgeConfig(CHAIN_ID);
    const timeOver =
      currentTimestamp -
      Number(this.claim.timestampClaimed) -
      bridgeConfig.sequencerDelayLimit -
      bridgeConfig.epochPeriod;

    if (timeOver < 0) {
      this.emitter.emit(BotEvents.VERIFICATION_CANT_START, this.epoch, -1 * timeOver);
      return;
    }
    const estimateGas = await this.veaOutbox[
      "startVerification(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim);
    const startVerifTrx = await this.veaOutbox.startVerification(this.epoch, this.claim, { gasLimit: estimateGas });
    this.emitter.emit(BotEvents.TXN_MADE, startVerifTrx.hash, this.epoch, "Start Verification");
    this.transactions.startVerificationTxn = {
      hash: startVerifTrx.hash,
      broadcastedTimestamp: currentTime,
    };
  }

  /**
   * Verify snapshot for this.epoch in VeaOutbox(ETH).
   */
  public async verifySnapshot(currentTimestamp: number) {
    this.emitter.emit(BotEvents.VERIFYING_SNAPSHOT, this.epoch);
    if (this.claim == null) {
      throw new ClaimNotSetError();
    }
    const currentTime = Date.now();
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.verifySnapshotTxn,
      ContractType.OUTBOX,
      currentTime
    );
    if (transactionStatus != TransactionStatus.NOT_MADE && transactionStatus != TransactionStatus.EXPIRED) {
      return;
    }
    const bridgeConfig = getBridgeConfig(CHAIN_ID);
    const timeLeft = currentTimestamp - Number(this.claim.timestampVerification) - bridgeConfig.minChallengePeriod;
    // Claim not resolved yet, check if we can verifySnapshot
    if (timeLeft < 0) {
      this.emitter.emit(BotEvents.CANT_VERIFY_SNAPSHOT, this.epoch, -1 * timeLeft);
      return;
    }
    // Estimate gas for verifySnapshot
    const estimateGas = await this.veaOutbox[
      "verifySnapshot(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim);
    const claimTransaction = await this.veaOutbox.verifySnapshot(this.epoch, this.claim, {
      gasLimit: estimateGas,
    });
    this.emitter.emit(BotEvents.TXN_MADE, claimTransaction.hash, this.epoch, "Verify Snapshot");
    this.transactions.verifySnapshotTxn = {
      hash: claimTransaction.hash,
      broadcastedTimestamp: currentTime,
    };
  }

  /**
   * Withdraw the claim deposit.
   *
   */
  public async withdrawClaimDeposit() {
    this.emitter.emit(BotEvents.WITHDRAWING_CLAIM_DEPOSIT, this.epoch);
    if (this.claim == null) {
      throw new ClaimNotSetError();
    }
    const currentTime = Date.now();
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.withdrawClaimDepositTxn,
      ContractType.OUTBOX,
      currentTime
    );
    if (transactionStatus != TransactionStatus.NOT_MADE && transactionStatus != TransactionStatus.EXPIRED) {
      return;
    }
    const estimateGas = await this.veaOutbox[
      "withdrawClaimDeposit(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"
    ].estimateGas(this.epoch, this.claim);
    const withdrawTxn = await this.veaOutbox.withdrawClaimDeposit(this.epoch, this.claim, {
      gasLimit: estimateGas,
    });
    this.emitter.emit(BotEvents.TXN_MADE, withdrawTxn.hash, this.epoch, "Withdraw Deposit");
    this.transactions.withdrawClaimDepositTxn = {
      hash: withdrawTxn.hash,
      broadcastedTimestamp: currentTime,
    };
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
    const currentTime = Date.now();
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.challengeTxn,
      ContractType.OUTBOX,
      currentTime
    );
    if (transactionStatus != TransactionStatus.NOT_MADE && transactionStatus != TransactionStatus.EXPIRED) {
      return;
    }
    const { deposit } = getBridgeConfig(CHAIN_ID);
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
    this.transactions.challengeTxn = {
      hash: challengeTxn.hash,
      broadcastedTimestamp: currentTime,
    };
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
    const currentTime = Date.now();
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.withdrawChallengeDepositTxn,
      ContractType.OUTBOX,
      currentTime
    );
    if (transactionStatus != TransactionStatus.NOT_MADE && transactionStatus != TransactionStatus.EXPIRED) {
      return;
    }
    const withdrawDepositTxn = await this.veaOutbox.withdrawChallengeDeposit(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, withdrawDepositTxn.hash, this.epoch, "Withdraw");
    this.transactions.withdrawChallengeDepositTxn = {
      hash: withdrawDepositTxn.hash,
      broadcastedTimestamp: currentTime,
    };
  }

  /**
   * Send a snapshot from the VeaInbox(ARB) to the VeaOutox(ETH).
   */
  public async sendSnapshot() {
    this.emitter.emit(BotEvents.SENDING_SNAPSHOT, this.epoch);
    if (!this.claim) {
      throw new ClaimNotSetError();
    }
    const currentTime = Date.now();
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.sendSnapshotTxn,
      ContractType.INBOX,
      currentTime
    );
    if (transactionStatus != TransactionStatus.NOT_MADE && transactionStatus != TransactionStatus.EXPIRED) {
      return;
    }
    const sendSnapshotTxn = await this.veaInbox.sendSnapshot(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, sendSnapshotTxn.hash, this.epoch, "Send Snapshot");
    this.transactions.sendSnapshotTxn = {
      hash: sendSnapshotTxn.hash,
      broadcastedTimestamp: currentTime,
    };
  }

  /**
   * Execute a sent snapshot to resolve dispute in VeaOutbox (ETH).
   */
  public async resolveChallengedClaim(sendSnapshotTxn: string, executeMsg: typeof messageExecutor = messageExecutor) {
    this.emitter.emit(BotEvents.EXECUTING_SNAPSHOT, this.epoch);
    const currentTime = Date.now();
    const transactionStatus = await this.checkTransactionStatus(
      this.transactions.executeSnapshotTxn,
      ContractType.OUTBOX,
      currentTime
    );
    if (transactionStatus != TransactionStatus.NOT_MADE && transactionStatus != TransactionStatus.EXPIRED) {
      return;
    }
    const msgExecuteTrnx = await executeMsg(sendSnapshotTxn, this.veaInboxProvider, this.veaOutboxProvider);
    this.emitter.emit(BotEvents.TXN_MADE, msgExecuteTrnx.hash, this.epoch, "Execute Snapshot");
    this.transactions.executeSnapshotTxn = {
      hash: msgExecuteTrnx.hash,
      broadcastedTimestamp: currentTime,
    };
  }
}
