import { getBridgeConfig } from "../consts/bridgeRoutes";
import { ClaimStruct } from "./claim";

interface PendingTransactions {
  claim: string | null;
  verifySnapshot: string | null;
  withdrawClaimDeposit: string | null;
  startVerification: string | null;
}

export class TransactionHandler {
  public epoch: number;
  public veaOutbox: any;
  public chainId: number;
  public claim: ClaimStruct | null;
  public getBridgeConfig: typeof getBridgeConfig;
  public requiredConfirmations: number = 12;

  public pendingTransactions: PendingTransactions = {
    claim: null,
    verifySnapshot: null,
    withdrawClaimDeposit: null,
    startVerification: null,
  };

  constructor(
    chainId: number,
    epoch: number,
    veaOutbox,
    claim?: ClaimStruct,
    fetchBridgeConfig: typeof getBridgeConfig = getBridgeConfig
  ) {
    this.epoch = epoch;
    this.veaOutbox = veaOutbox;
    this.chainId = chainId;
    this.claim = claim;
    this.getBridgeConfig = fetchBridgeConfig;
  }

  public async checkTransactionPendingStatus(trnxHash: string | null): Promise<boolean> {
    if (trnxHash == null) {
      return false;
    }

    const receipt = await this.veaOutbox.provider.getTransactionReceipt(trnxHash);

    if (!receipt) {
      console.log(`Transaction ${trnxHash} is pending`);
      return true;
    }

    const currentBlock = await this.veaOutbox.provider.getBlock("latest");
    const confirmations = currentBlock.number - receipt.blockNumber;

    if (confirmations >= this.requiredConfirmations) {
      console.log(`Transaction ${trnxHash} is final with ${confirmations} confirmations`);
      return false;
    } else {
      console.log(`Transaction ${trnxHash} is not final yet.`);
      return true;
    }
  }

  public async makeClaim(stateRoot: string) {
    if (await this.checkTransactionPendingStatus(this.pendingTransactions.claim)) {
      console.log("Claim transaction is still pending with hash: " + this.pendingTransactions.claim);
      return;
    }
    const bridgeConfig = this.getBridgeConfig(this.chainId);
    const estimateGas = await this.veaOutbox.estimateGas.claim(this.epoch, stateRoot, { value: bridgeConfig.deposit });
    const claimTransaction = await this.veaOutbox.claim(this.epoch, stateRoot, {
      value: bridgeConfig.deposit,
      gasLimit: estimateGas,
    });
    console.log(`Epoch ${this.epoch} was claimed with trnx hash ${claimTransaction.hash}`);
    this.pendingTransactions.claim = claimTransaction.hash;
  }

  public async startVerification(latestBlockTimestamp: number) {
    if (this.claim == null) {
      throw new Error("Claim is not set");
    }
    if (await this.checkTransactionPendingStatus(this.pendingTransactions.startVerification)) {
      console.log(
        "Start verification transaction is still pending with hash: " + this.pendingTransactions.startVerification
      );
      return;
    }
    const bridgeConfig = this.getBridgeConfig(this.chainId);
    const timeOver =
      latestBlockTimestamp - this.claim.timestampClaimed - bridgeConfig.sequencerDelayLimit - bridgeConfig.epochPeriod;
    console.log(timeOver);
    if (timeOver >= 0) {
      const estimateGas = await this.veaOutbox.estimateGas.startVerification(this.epoch, this.claim);
      const startVerifTrx = await this.veaOutbox.startVerification(this.epoch, this.claim, { gasLimit: estimateGas });
      console.log(`Verification started for epoch ${this.epoch} with trx hash ${startVerifTrx.hash}`);
      this.pendingTransactions.startVerification = startVerifTrx.hash;
    } else {
      console.log("Sequencer delay not passed yet, seconds left: " + -1 * timeOver);
    }
  }

  public async verifySnapshot(latestBlockTimestamp: number) {
    if (this.claim == null) {
      throw new Error("Claim is not set");
    }
    if (await this.checkTransactionPendingStatus(this.pendingTransactions.verifySnapshot)) {
      console.log("Verify snapshot transaction is still pending with hash: " + this.pendingTransactions.verifySnapshot);
      return;
    }
    const bridgeConfig = this.getBridgeConfig(this.chainId);

    const timeLeft = latestBlockTimestamp - this.claim.timestampClaimed - bridgeConfig.minChallengePeriod;
    console.log("Time left for verification: " + timeLeft);
    console.log(latestBlockTimestamp, this.claim.timestampClaimed, bridgeConfig.minChallengePeriod);
    // Claim not resolved yet, check if we can verifySnapshot
    if (timeLeft >= 0) {
      console.log("Verification period passed, verifying snapshot");
      // Estimate gas for verifySnapshot
      const estimateGas = await this.veaOutbox.estimateGas.verifySnapshot(this.epoch, this.claim);
      const claimTransaction = await this.veaOutbox.verifySnapshot(this.epoch, this.claim, {
        gasLimit: estimateGas,
      });
      console.log(`Epoch ${this.epoch} verification started with trnx hash ${claimTransaction.hash}`);
      this.pendingTransactions.verifySnapshot = claimTransaction.hash;
    } else {
      console.log("Censorship test in progress, sec left: " + -1 * timeLeft);
    }
  }

  public async withdrawClaimDeposit() {
    if (await this.checkTransactionPendingStatus(this.pendingTransactions.withdrawClaimDeposit)) {
      console.log(
        "Withdraw deposit transaction is still pending with hash: " + this.pendingTransactions.withdrawClaimDeposit
      );
      return;
    }
    const estimateGas = await this.veaOutbox.estimateGas.withdrawClaimDeposit(this.epoch, this.claim);
    const claimTransaction = await this.veaOutbox.withdrawClaimDeposit(this.epoch, this.claim, {
      gasLimit: estimateGas,
    });
    console.log(`Deposit withdrawn with trnx hash ${claimTransaction.hash}`);
    this.pendingTransactions.withdrawClaimDeposit = claimTransaction.hash;
  }
}
