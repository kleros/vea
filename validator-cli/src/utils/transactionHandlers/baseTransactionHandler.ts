import { JsonRpcProvider } from "@ethersproject/providers";
import { AccessListish, SignatureLike, Transaction as SignedTransaction } from "ethers";
import { BotEvents } from "../botEvents";
import { ClaimNotSetError } from "../errors";
import { getBridgeConfig, Network } from "../../consts/bridgeRoutes";
import { defaultEmitter } from "../emitter";
import { getOutboxReadBlock } from "../arbToEthState";
import { ALREADY_KNOWN, NONCE_USED } from "../fallbackProvider";
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
  /** `currentCount`: the inbox count the save is for, so a mined save that covers less is superseded. */
  saveSnapshot(currentCount?: number): Promise<void>;
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
  /** When it was last broadcast: sent, or re-broadcast while stuck (`rebroadcastStuck`). */
  broadcastedTimestamp: number;
  /** The nonce it was sent with: until the signer's `latest` nonce passes it, nothing else is sent in its place. */
  nonce?: number;
  /** Its fee caps; `gasPrice` is set only on a legacy (pre EIP-1559) transaction. */
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
  /** With the fee cap, the most it can still cost while unmined (`unminedCost`). */
  value?: bigint;
  gasLimit?: bigint;
  /** The signed transaction as broadcast: a re-broadcast sends these bytes again, never others. */
  raw?: string;
};

/** A number as a send reports it: bigint or null from ethers v6, a BigNumber, number or undefined from v5. */
type ReportedNumber = bigint | number | { toString(): string } | null | undefined;

/** What a send returns: an ethers v6 contract response, or the v5 `ContractTransaction` of `messageExecutor`. */
type SentResponse = {
  hash: string;
  type?: number | null;
  chainId?: ReportedNumber;
  nonce?: number | null;
  maxFeePerGas?: ReportedNumber;
  maxPriorityFeePerGas?: ReportedNumber;
  gasPrice?: ReportedNumber;
  to?: string | null;
  data?: string;
  value?: ReportedNumber;
  gasLimit?: ReportedNumber;
  accessList?: AccessListish | null;
  /** ethers v6 reports the signature whole; v5 as `r`, `s` and `v`. */
  signature?: SignatureLike | null;
  r?: string;
  s?: string;
  v?: number;
};

const toOptionalBigInt = (value: ReportedNumber): bigint | undefined =>
  value == null ? undefined : BigInt(value.toString());

/**
 * The signed transaction a send broadcast, rebuilt from the fields and signature its response
 * reports. Kept only when it hashes back to the send's own hash, so a re-broadcast can only ever
 * repeat the transaction byte for byte; undefined for a response that does not carry them.
 */
const rawOf = (tx: SentResponse): string | undefined => {
  const signature = tx.signature ?? (tx.r && tx.s && tx.v != null ? { r: tx.r, s: tx.s, v: tx.v } : undefined);
  if (!signature) return undefined;
  const maxFeePerGas = toOptionalBigInt(tx.maxFeePerGas);
  try {
    const signed = SignedTransaction.from({
      // A v5 response reports no type for a legacy transaction.
      type: tx.type ?? (maxFeePerGas === undefined ? 0 : 2),
      chainId: toOptionalBigInt(tx.chainId),
      nonce: tx.nonce ?? undefined,
      gasLimit: toOptionalBigInt(tx.gasLimit),
      gasPrice: maxFeePerGas === undefined ? toOptionalBigInt(tx.gasPrice) : undefined,
      maxFeePerGas,
      maxPriorityFeePerGas: toOptionalBigInt(tx.maxPriorityFeePerGas),
      to: tx.to ?? undefined,
      value: toOptionalBigInt(tx.value),
      data: tx.data,
      accessList: tx.accessList ?? undefined,
      signature,
    });
    return signed.hash?.toLowerCase() === tx.hash.toLowerCase() ? signed.serialized : undefined;
  } catch {
    return undefined;
  }
};

/** The record of a send, with the nonce, fees, cost and signed bytes it went out with. */
const toTransaction = (tx: SentResponse, broadcastedTimestamp: number): Transaction => {
  const maxFeePerGas = toOptionalBigInt(tx.maxFeePerGas);
  return {
    hash: tx.hash,
    broadcastedTimestamp,
    nonce: tx.nonce ?? undefined,
    maxFeePerGas,
    maxPriorityFeePerGas: toOptionalBigInt(tx.maxPriorityFeePerGas),
    // ethers may also report a gas price for an EIP-1559 transaction; only a legacy one is priced by it.
    gasPrice: maxFeePerGas === undefined ? toOptionalBigInt(tx.gasPrice) : undefined,
    value: toOptionalBigInt(tx.value),
    gasLimit: toOptionalBigInt(tx.gasLimit),
    raw: rawOf(tx),
  };
};

const minOf = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** A challenge's priority fee, capped at its `maxFeePerGas`. */
const CHALLENGE_MAX_PRIORITY_FEE = BigInt(6_667_000_000_000); // 6667 gwei

/**
 * The node's own words in a send error (classified by `ALREADY_KNOWN` and `NONCE_USED`, shared
 * with the fallback providers). ethers throws a node's JSON-RPC answer: v5 keeps it in `error` and
 * `body`, v6 in `error` (unmapped) or `info.error` (mapped to a code).
 */
const nodeAnswerOf = (error: any): string =>
  [
    error?.message,
    error?.shortMessage,
    error?.error?.message,
    error?.info?.error?.message,
    error?.body,
    error?.error?.body,
  ]
    .filter((part) => typeof part === "string")
    .join(" ");

/** A send kept in `unminedSends`: its record, the contract it was sent to, and the route and epoch it was sent for. */
interface UnminedSend {
  tx: Transaction;
  contract: ContractType;
  chainId: number;
  network: Network;
  epoch: number;
}

/**
 * Our sends by the chain they went to and the signer, then by nonce: the newest send at each
 * nonce, until the signer's `latest` nonce is read past it. A nonce is the account's on that
 * chain, not its handler's: handlers are dropped (a snapshot handler and a devnet epoch's at each
 * rollover, an epoch's once it leaves the watch) or stop sending (a claim whose window closed),
 * and a transaction of theirs left unmined holds every later send of ours on that chain behind it.
 * So every send first re-broadcasts, unchanged, the ones stuck on its chain (`rebroadcastStuck`).
 * None is ever replaced or outbid, and nothing is sent to fill its nonce: `NONCE_STUCK` asks the
 * operator to unblock the nonce by hand. Sends made by another process, or before a restart, are
 * not known.
 * A send evicted from every mempool (its fee cap under a risen base fee, say) frees its nonce: the
 * `pending` nonce falls back to it, and a re-broadcast the node refuses does not take it back. The
 * next fresh send of ours, of any action, takes it at the fee data of its own send time, and the
 * evicted action, its nonce used with no receipt for its hash, goes out fresh at the next nonce
 * (`waitsOnExpired`). Accepted by the operator (2026-10-26) as what "no automatic bumping" means:
 * nothing is outbid, re-priced or escalated, and no send, a challenge least of all, is held
 * behind a nonce gap until the operator fills it.
 */
const unminedSends = new Map<string, Map<number, UnminedSend>>();

/** The nonces, under the keys of `unminedSends`, whose `NONCE_STUCK` alert is out: until `latest` passes them. */
const nonceStuckAlerted = new Map<string, Set<number>>();

/** Test-only: forget every send recorded and every `NONCE_STUCK` alert emitted. */
export const resetUnminedSends = (): void => {
  unminedSends.clear();
  nonceStuckAlerted.clear();
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

  /**
   * FINAL once the receipt has `MAX_PENDING_CONFIRMATIONS` confirmations and lies at or below the
   * block the bot reads that contract's chain at (`readBlockOf`). The read block trails latest by
   * far more than the confirmations: until it reaches the receipt, the bot still sees the state
   * from before the transaction and would send it again (a claim reverting "Claim already made.").
   * A reverted inbox transaction needs only the confirmations: see below.
   */
  public async checkTransactionStatus(
    trnx: Transaction | null,
    contract: ContractType,
    currentTime: number
  ): Promise<TransactionStatus> {
    const provider = this.providerOf(contract);

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
    if (confirmations < MAX_PENDING_CONFIRMATIONS) {
      this.emitter.emit(BotEvents.TXN_NOT_FINAL, trnx.hash, MAX_PENDING_CONFIRMATIONS - confirmations);
      return TransactionStatus.NOT_FINAL;
    }
    // A reverted inbox transaction changed nothing for the read block to reach, and no other
    // transaction makes one revert (saveSnapshot has no check, sendSnapshot only refuses an epoch
    // not yet past): it goes out again once confirmed. The inbox finalized block trails latest by
    // more than the saving period and stops in a finality stall, so waiting for it would lose the
    // retry. An outbox revert waits: it usually means another transaction got in first, which the
    // helper must read before it decides again.
    const revertedOnInbox = contract === ContractType.INBOX && receipt.status === 0;
    const readBlock = revertedOnInbox ? undefined : await this.readBlockOf(contract);
    if (readBlock !== undefined && receipt.blockNumber > readBlock) {
      this.emitter.emit(BotEvents.TXN_NOT_FINAL, trnx.hash, receipt.blockNumber - readBlock);
      return TransactionStatus.NOT_FINAL;
    }

    this.emitter.emit(BotEvents.TXN_FINAL, trnx.hash, confirmations);
    return TransactionStatus.FINAL;
  }

  /** The provider of the chain `contract` lives on. */
  private providerOf(contract: ContractType): JsonRpcProvider {
    switch (contract) {
      case ContractType.INBOX:
        return this.veaInboxProvider;
      case ContractType.OUTBOX:
        return this.veaOutboxProvider;
      case ContractType.ROUTER:
        return this.veaRouterProvider;
    }
  }

  /**
   * The block the bot reads `contract`'s chain at: the outbox at `getOutboxReadBlock`, the inbox at
   * its `finalized` block (the head `isSnapshotNeeded`'s `SnapshotSaved` scan reads). The router has
   * none: its execution is followed through the message status, read at L1's latest block.
   */
  private async readBlockOf(contract: ContractType): Promise<number | undefined> {
    switch (contract) {
      case ContractType.OUTBOX:
        return (await getOutboxReadBlock({ outboxProvider: this.veaOutboxProvider, emitter: this.emitter })).number;
      case ContractType.INBOX:
        return (await this.veaInboxProvider.getBlock("finalized")).number;
      case ContractType.ROUTER:
        return undefined;
    }
  }

  /** The chain id `contract` lives on: the key its sends are kept under in `unminedSends`. */
  private chainIdOf(contract: ContractType): number | undefined {
    switch (contract) {
      case ContractType.INBOX:
        return getBridgeConfig(this.chainId).inboxChainId;
      case ContractType.OUTBOX:
        return this.chainId;
      case ContractType.ROUTER:
        return getBridgeConfig(this.chainId).routerChainId;
    }
  }

  /** The key `contract`'s chain and the signer `address` are kept under in `unminedSends` and `nonceStuckAlerted`. */
  private sendsKey(contract: ContractType, address: string): string {
    return `${this.chainIdOf(contract)}_${address.toLowerCase()}`;
  }

  private unminedSendsOf(contract: ContractType, address: string): Map<number, UnminedSend> {
    const key = this.sendsKey(contract, address);
    let sends = unminedSends.get(key);
    if (!sends) unminedSends.set(key, (sends = new Map()));
    return sends;
  }

  /** Forget the sends below the signer's `latest` nonce (mined, or their nonce taken); returns that nonce. */
  private async pruneMined(contract: ContractType, address: string): Promise<number> {
    const latestNonce = await this.providerOf(contract).getTransactionCount(address, "latest");
    this.forgetUsedNonces(contract, latestNonce);
    return latestNonce;
  }

  /**
   * The signer's `latest` nonce on `contract`'s chain was read at `latestNonce`: the sends and the
   * `NONCE_STUCK` alerts below it are done with.
   */
  protected forgetUsedNonces(contract: ContractType, latestNonce: number): void {
    const address = this.getSignerAddress();
    if (!address) return;
    const key = this.sendsKey(contract, address);
    for (const nonces of [unminedSends.get(key), nonceStuckAlerted.get(key)]) {
      for (const nonce of [...(nonces?.keys() ?? [])]) if (nonce < latestNonce) nonces!.delete(nonce);
    }
  }

  private unminedSendOf(tx: Transaction, contract: ContractType): UnminedSend {
    return { tx, contract, chainId: this.chainId, network: this.network, epoch: this.epoch };
  }

  /** `toTransaction`, also kept in `unminedSends` so a later send of any handler re-broadcasts it while it is stuck. */
  protected recordSent(tx: SentResponse, broadcastedTimestamp: number, contract: ContractType): Transaction {
    const sent = toTransaction(tx, broadcastedTimestamp);
    const address = this.getSignerAddress();
    if (sent.nonce === undefined || !address) return sent;
    this.unminedSendsOf(contract, address).set(sent.nonce, this.unminedSendOf(sent, contract));
    return sent;
  }

  /** The cost (`value` + `gasLimit` x fee cap) of our sends still pooled on that chain. */
  private async unminedCost(contract: ContractType, address: string): Promise<bigint> {
    if (this.unminedSendsOf(contract, address).size === 0) return BigInt(0);
    await this.pruneMined(contract, address);
    let cost = BigInt(0);
    for (const { tx } of this.unminedSendsOf(contract, address).values()) {
      cost += (tx.value ?? BigInt(0)) + (tx.gasLimit ?? BigInt(0)) * (tx.maxFeePerGas ?? tx.gasPrice ?? BigInt(0));
    }
    return cost;
  }

  /**
   * Re-broadcast, unchanged, every send of ours on `contract`'s chain that is stuck: broadcast (or
   * last re-broadcast) more than MAX_PENDING_TIME ago, its nonce not yet passed by the signer's
   * `latest` nonce. Every send calls it first: a stuck transaction of a handler that was dropped,
   * or that no longer sends it, holds every later send of ours on that chain behind it. Lowest
   * nonce first; each raises `NONCE_STUCK` once while it is stuck. Nothing is ever sent to replace
   * it: no fee bump, no fill (an evicted one's freed nonce goes to the next fresh send: `unminedSends`).
   * `own`, the caller's EXPIRED transaction, counts as stuck whatever its age, and is kept in
   * `unminedSends` if it was not (unless a later send of ours holds its nonce there).
   * Returns the signer's `latest` nonce; undefined when nothing was stuck to read it for, or with
   * no signer.
   */
  protected async rebroadcastStuck(contract: ContractType, own?: Transaction): Promise<number | undefined> {
    const address = this.getSignerAddress();
    if (!address) return undefined;
    const sends = this.unminedSendsOf(contract, address);
    if (own?.nonce !== undefined && !sends.has(own.nonce)) sends.set(own.nonce, this.unminedSendOf(own, contract));
    const now = Date.now();
    const isStuck = ({ tx }: UnminedSend) => tx === own || now - tx.broadcastedTimestamp > MAX_PENDING_TIME;
    if (own?.nonce === undefined && ![...sends.values()].some(isStuck)) return undefined;
    const latestNonce = await this.pruneMined(contract, address);
    const stuck = [...sends.entries()].filter(([, send]) => isStuck(send)).sort(([a], [b]) => a - b);
    for (const [nonce, send] of stuck) {
      if (await this.rebroadcast(send, contract)) await this.alertNonceStuck(contract, nonce, { latestNonce });
    }
    return latestNonce;
  }

  /**
   * Broadcast `send` again, byte for byte, through this handler's provider of `contract`'s chain
   * (the one it was sent on), and pace the next one MAX_PENDING_TIME away. A node that holds it
   * already, or whose nonce is used, is no failure (`ALREADY_KNOWN`, `NONCE_USED`, or ethers'
   * `NONCE_EXPIRED`; the fallback providers answer "already known" with the hash); any other
   * refusal raises `ALERT` `TXN_REBROADCAST_FAILED`. Never sends anything else. Returns false once
   * the node answers that its nonce is used, true while it may still be stuck.
   */
  private async rebroadcast(send: UnminedSend, contract: ContractType): Promise<boolean> {
    const { tx } = send;
    tx.broadcastedTimestamp = Date.now();
    // Not known as signed: nothing can be broadcast in its name, and the alert still goes out.
    if (!tx.raw) return true;
    try {
      await this.providerOf(contract).sendTransaction(tx.raw);
    } catch (error: any) {
      const answer = nodeAnswerOf(error);
      if (error?.code === "NONCE_EXPIRED" || NONCE_USED.test(answer)) return false;
      if (!ALREADY_KNOWN.test(answer)) {
        this.emitter.emit(BotEvents.ALERT, {
          level: "warn",
          code: "TXN_REBROADCAST_FAILED",
          chainId: send.chainId,
          network: send.network,
          epoch: send.epoch,
          details: { hash: tx.hash, nonce: tx.nonce, contract: send.contract, message: error?.message },
        });
      }
    }
    return true;
  }

  /**
   * `ALERT` `NONCE_STUCK` for our nonce `nonce` on `contract`'s chain, once until the signer's
   * `latest` nonce passes it (`forgetUsedNonces`), whichever handler sees it: the send of ours at
   * that nonce when it is known (its route, epoch, hash and fee caps), the chain's base fee when it
   * can be read, and `extra`. `approveWeth` (arbToGnosisHandler.ts) raises it too, never twice.
   */
  protected async alertNonceStuck(contract: ContractType, nonce: number, extra: Record<string, unknown> = {}) {
    const address = this.getSignerAddress();
    if (!address) return;
    const key = this.sendsKey(contract, address);
    let alerted = nonceStuckAlerted.get(key);
    if (!alerted) nonceStuckAlerted.set(key, (alerted = new Set()));
    if (alerted.has(nonce)) return;
    alerted.add(nonce);
    const send = unminedSends.get(key)?.get(nonce);
    const fees = !send
      ? {}
      : send.tx.maxFeePerGas !== undefined
      ? {
          maxFeePerGas: send.tx.maxFeePerGas.toString(),
          maxPriorityFeePerGas: send.tx.maxPriorityFeePerGas?.toString(),
        }
      : { gasPrice: send.tx.gasPrice?.toString() };
    const baseFee = await this.latestBaseFee(contract);
    this.emitter.emit(BotEvents.ALERT, {
      level: "warn",
      code: "NONCE_STUCK",
      chainId: send?.chainId ?? this.chainId,
      network: send?.network ?? this.network,
      epoch: send?.epoch ?? this.epoch,
      details: {
        ...extra,
        nonce,
        contract: send?.contract ?? contract,
        ...(send && { hash: send.tx.hash }),
        ...fees,
        ...(baseFee !== undefined && { baseFee: baseFee.toString() }),
      },
    });
  }

  /** The base fee of the latest block on `contract`'s chain; undefined when it cannot be read. */
  private async latestBaseFee(contract: ContractType): Promise<bigint | undefined> {
    try {
      return toOptionalBigInt((await this.providerOf(contract).getBlock("latest"))?.baseFeePerGas);
    } catch {
      return undefined;
    }
  }

  /**
   * Whether a handler waits on its EXPIRED `trnx` instead of sending its action again. A second
   * send would take a new nonce and queue behind it, and both would land (F18.1): while the
   * signer's `latest` nonce has not passed it, it is re-broadcast instead (`rebroadcastStuck`).
   * Once `latest` has passed it with no receipt for its hash, another transaction took that nonce
   * (replaced outside this process, or, once it left every mempool, a fresh send of ours: see
   * `unminedSends`): a fresh send, at the fee data of its own send time. One whose nonce or signer
   * is not known is sent fresh too, as before.
   */
  private async waitsOnExpired(trnx: Transaction, contract: ContractType): Promise<boolean> {
    if (trnx.nonce === undefined) return false;
    const latestNonce = await this.rebroadcastStuck(contract, trnx);
    if (latestNonce === undefined) return false;
    if (trnx.nonce >= latestNonce) return true;
    // Its nonce was used since its receipt was read: by it, mined in between, or by another transaction.
    return (await this.providerOf(contract).getTransactionReceipt(trnx.hash)) != null;
  }

  /**
   * The overrides a challenge is sent with (on the outbox chain). `maxFeePerGas` is the caller's
   * profit cap, lowered to what the balance left after `value` pays for `gasLimit`: a balance short
   * of the profit cap still challenges, at a lower price, instead of failing the funds check. The
   * balance is what our other sends still pooled on that chain leave of it (their `value` + gas at
   * their fee cap; the node counts them too). Its priority fee is `CHALLENGE_MAX_PRIORITY_FEE`, at
   * most `maxFeePerGas`. A stuck challenge is never re-priced: it is re-broadcast as it was
   * (`waitsOnExpired`).
   * Emits `CANNOT_FUND` and throws `CannotFundError` when the balance cannot pay `gasLimit` at the
   * chain's base fee (no challenge could be included). A profit cap alone below the base fee is no
   * funding shortfall: that challenge is sent as before.
   */
  protected async challengeOverrides({
    value = BigInt(0),
    gasLimit,
    profitCap,
  }: {
    value?: bigint;
    gasLimit: bigint;
    profitCap: bigint;
  }): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    let maxFeePerGas = profitCap;
    const address = this.getSignerAddress();
    if (address) {
      const balance = BigInt((await this.veaOutboxProvider.getBalance(address)).toString());
      const pooled = await this.unminedCost(ContractType.OUTBOX, address);
      const available = balance > pooled ? balance - pooled : BigInt(0);
      const affordable = available > value ? (available - value) / gasLimit : BigInt(0);
      const baseFee = await this.baseFeeOf(this.veaOutboxProvider);
      if (affordable < baseFee) this.cannotFund("challenge", value + gasLimit * baseFee, available);
      maxFeePerGas = minOf(maxFeePerGas, affordable);
    }
    return { maxFeePerGas, maxPriorityFeePerGas: minOf(CHALLENGE_MAX_PRIORITY_FEE, maxFeePerGas) };
  }

  /**
   * `send`, with the node's INSUFFICIENT_FUNDS refusal raised as `CANNOT_FUND` for `action`: the
   * node counts every send of ours still pooled, `unminedSends` only those of this process.
   */
  protected async sendOrCannotFund<T>(
    action: string,
    {
      value = BigInt(0),
      gasLimit,
      maxFeePerGas = BigInt(0),
    }: { value?: bigint; gasLimit: bigint; maxFeePerGas?: bigint },
    send: () => Promise<T>
  ): Promise<T> {
    try {
      return await send();
    } catch (error: any) {
      if (error?.code !== "INSUFFICIENT_FUNDS") throw error;
      const address = this.getSignerAddress();
      const available = address ? BigInt((await this.veaOutboxProvider.getBalance(address)).toString()) : BigInt(0);
      this.cannotFund(action, value + gasLimit * maxFeePerGas, available);
    }
  }

  /** The chain's base fee at its latest block; the fee data's gas price on a chain without one. */
  private async baseFeeOf(provider: JsonRpcProvider): Promise<bigint> {
    const latest = await provider.getBlock("latest");
    const baseFee = latest?.baseFeePerGas ?? (await provider.getFeeData()).gasPrice;
    return toOptionalBigInt(baseFee) ?? BigInt(0);
  }

  /**
   * Whether a handler sends its action now: none sent yet, the last one settled (FINAL), or
   * EXPIRED and no longer holding its nonce (`waitsOnExpired`). PENDING and NOT_FINAL wait.
   */
  public async toSubmitTransaction(
    trnx: Transaction | null,
    contract: ContractType,
    currentTime: number
  ): Promise<boolean> {
    const status = await this.checkTransactionStatus(trnx, contract, currentTime);
    if (status === TransactionStatus.PENDING || status === TransactionStatus.NOT_FINAL) return false;
    if (status === TransactionStatus.EXPIRED && trnx) return !(await this.waitsOnExpired(trnx, contract));
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

    await this.rebroadcastStuck(ContractType.OUTBOX);
    const tx = await (this.veaOutbox as any).startVerification(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Start Verification");
    this.transactions.startVerificationTxn = this.recordSent(tx, now, ContractType.OUTBOX);
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

    await this.rebroadcastStuck(ContractType.OUTBOX);
    const tx = await (this.veaOutbox as any).verifySnapshot(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Verify Snapshot");
    this.transactions.verifySnapshotTxn = this.recordSent(tx, now, ContractType.OUTBOX);
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

    await this.rebroadcastStuck(ContractType.OUTBOX);
    const tx = await (this.veaOutbox as any).withdrawClaimDeposit(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Withdraw Claim Deposit");
    this.transactions.withdrawClaimDepositTxn = this.recordSent(tx, now, ContractType.OUTBOX);
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

    await this.rebroadcastStuck(ContractType.OUTBOX);
    const tx = await (this.veaOutbox as any).withdrawChallengeDeposit(this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Withdraw Challenge Deposit");
    this.transactions.withdrawChallengeDepositTxn = this.recordSent(tx, now, ContractType.OUTBOX);
  }

  /**
   * Save a snapshot, unless the last save is still pending (a pending save saves the root of
   * every message up to its inclusion), EXPIRED but still holding its nonce (re-broadcast instead,
   * `waitsOnExpired`), or mined but held as NOT_FINAL with nothing new to cover (`isSaveOutdated`).
   * `currentCount`: the inbox count this save is for.
   */
  public async saveSnapshot(currentCount?: number) {
    this.emitter.emit(BotEvents.SAVING_SNAPSHOT, this.epoch);

    const now = Date.now();
    const previous = this.transactions.saveSnapshotTxn;
    const status = await this.checkTransactionStatus(previous, ContractType.INBOX, now);
    if (status === TransactionStatus.PENDING) return;
    if (status === TransactionStatus.NOT_FINAL && !(await this.isSaveOutdated(previous!, currentCount))) return;
    if (status === TransactionStatus.EXPIRED && (await this.waitsOnExpired(previous!, ContractType.INBOX))) return;

    await this.rebroadcastStuck(ContractType.INBOX);
    const tx = await (this.veaInbox as any).saveSnapshot();
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, "Save Snapshot");
    this.transactions.saveSnapshotTxn = this.recordSent(tx, now, ContractType.INBOX);
    this.saveSnapshotCount = currentCount;
  }
  /** The inbox count the last save was sent for: what it covered when its receipt has no SnapshotSaved log. */
  private saveSnapshotCount?: number;

  /**
   * Whether a mined save that the inbox finalized block has not reached yet no longer covers the
   * inbox: it succeeded, has MAX_PENDING_CONFIRMATIONS, and `currentCount` is above the count its
   * own SnapshotSaved log saved (without one, the count it was sent for). A message that arrived
   * after it needs a new save before the epoch ends, and the finalized block trails latest by more
   * than the saving period. At the same count it is held: it saved that root already, and the
   * SnapshotSaved scan only stops asking once the finalized block reaches it.
   */
  private async isSaveOutdated(save: Transaction, currentCount: number | undefined): Promise<boolean> {
    if (currentCount === undefined) return false;
    const receipt = await this.veaInboxProvider.getTransactionReceipt(save.hash);
    if (!receipt || receipt.status !== 1) return false;
    const latest = await this.veaInboxProvider.getBlock("latest");
    if (latest.number - receipt.blockNumber < MAX_PENDING_CONFIRMATIONS) return false;
    const savedCount = this.snapshotSavedCountOf(receipt) ?? this.saveSnapshotCount;
    return savedCount !== undefined && currentCount > savedCount;
  }

  /** The `_count` of the inbox's SnapshotSaved log in `receipt`; undefined when there is none or it cannot be read. */
  private snapshotSavedCountOf(receipt: { logs?: { address: string; topics: string[]; data: string }[] }) {
    const inbox = this.veaInbox as any;
    const address = typeof inbox?.target === "string" ? inbox.target.toLowerCase() : undefined;
    for (const log of receipt.logs ?? []) {
      if (address !== undefined && String(log.address).toLowerCase() !== address) continue;
      try {
        const parsed = inbox?.interface?.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "SnapshotSaved") return Number(parsed.args[2]);
      } catch {
        // Not one of the inbox's events.
      }
    }
    return undefined;
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
    await this.rebroadcastStuck(ContractType.OUTBOX);
    const tx = await (this.veaOutbox as any)[method](this.epoch, this.claim);
    this.emitter.emit(BotEvents.TXN_MADE, tx.hash, this.epoch, `Withdraw ${party} escape hatch`);
    this.transactions[txnKey] = this.recordSent(tx, now, ContractType.OUTBOX);
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
