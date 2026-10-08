import { JsonRpcProvider, Block } from "@ethersproject/providers";
import { SequencerInbox } from "@arbitrum/sdk/dist/lib/abi/SequencerInbox";
import { NodeInterface__factory } from "@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory";
import { NodeInterface } from "@arbitrum/sdk/dist/lib/abi/NodeInterface";
import { NODE_INTERFACE_ADDRESS } from "@arbitrum/sdk/dist/lib/dataEntities/constants";
import { getArbitrumNetwork } from "@arbitrum/sdk";
import { SequencerInbox__factory } from "@arbitrum/sdk/dist/lib/abi/factories/SequencerInbox__factory";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
import { findFirstLog, findLatestLog } from "./logScanner";

// https://github.com/prysmaticlabs/prysm/blob/493905ee9e33a64293b66823e69704f012b39627/config/params/mainnet_config.go#L103
const slotsPerEpochEth = 32;
const secondsPerSlotEth = 12;

export interface SettledReadBlocks {
  inboxBlock: number;
  outboxBlock: number;
}

/**
 * Decision [O4]: the Arbitrum block a stalled-L1 decision is read at. It is the newest
 * Arbitrum block whose L1 batch has at least `FALLBACK_L1_CONFIRMATIONS` confirmations.
 */
export interface FinalityFallback {
  inboxBlock: Block;
  /** L1 blocks on top of the block that delivered `inboxBlock`'s batch. */
  l1Confirmations: number;
  /** The sequencer's backdating window (`maxTimeVariation().delaySeconds`), in seconds. */
  sequencerDelayLimit: number;
}

/**
 * [Arbitrum finalized block, L1 finalized block, finalityIssueFlagArb, finalityIssueFlagEth,
 * the [O4] fallback block (only computed while the L1 flag alone is set)]
 */
export type FinalityCheck = [Block, Block, boolean, boolean, FinalityFallback?];

// Decision [O4]: the L1 batch that posted a fallback block needs this many confirmations,
// and an outbox chain whose finality has stalled is read this many blocks behind latest.
export const FALLBACK_L1_CONFIRMATIONS = 64;
export const OUTBOX_STALL_DEPTH_BLOCKS = 64;
// Finality is two justified epochs (2 * 32 slots * 12 s) plus a 5 minute buffer; a
// finalized block further behind latest than this (by block timestamps) means a stall.
const finalityBuffer = 300;
const maxFinalityTimeSecondsEth = slotsPerEpochEth * 2 * secondsPerSlotEth;
export const FINALITY_STALL_SECS = maxFinalityTimeSecondsEth + finalityBuffer; // 1068

export interface ResolveSettledReadBlocksParams {
  inboxProvider: JsonRpcProvider;
  /** The outbox chain's provider: `outboxBlock` is that chain's block. */
  outboxProvider: JsonRpcProvider;
  /**
   * Frozen interface (validator-v1-fixes seed): the provider of Arbitrum's L1 (Ethereum; on
   * chain 10200 the Sepolia router provider), which the finality check runs on. When given,
   * `outboxBlock` is read from `outboxProvider` itself. When omitted, `outboxProvider` serves
   * both, which is correct only when the outbox chain is Arbitrum's L1.
   */
  l1Provider?: JsonRpcProvider;
  epoch: number;
  epochPeriod: number;
  emitter?: typeof defaultEmitter;
  fetchBlocksAndCheckFinality?: typeof getBlocksAndCheckFinality;
}

/**
 * Resolve the blocks at which this epoch's state can be read as settled.
 *
 * Two conditions have to hold before a read can be staked on:
 *
 *  - the block cannot be reorged away, so we anchor to the `finalized` head on
 *    both chains;
 *  - the block must sit at or after `(epoch + 1) * epochPeriod`, because
 *    `snapshots[epoch]` is still being written during epoch E.
 *
 * While L1 finality has stalled (and nothing else is wrong), decision [O4] applies instead:
 * the inbox is read at the newest Arbitrum block whose L1 batch has at least 64 L1
 * confirmations, once that block's timestamp is at or past
 * `(epoch + 1) * epochPeriod + sequencerDelayLimit`.
 *
 * The outbox is always read at `getOutboxReadBlock` of the outbox chain itself, which
 * applies the same stall rule to that chain.
 *
 * When neither holds the epoch is simply not decidable yet: callers skip it and
 * try again next cycle rather than acting on unsettled state.
 *
 * @returns The blocks to pin reads to, or null if the epoch is not yet decidable
 */
export const resolveSettledReadBlocks = async ({
  inboxProvider,
  outboxProvider,
  l1Provider,
  epoch,
  epochPeriod,
  emitter = defaultEmitter,
  fetchBlocksAndCheckFinality = getBlocksAndCheckFinality,
}: ResolveSettledReadBlocksParams): Promise<SettledReadBlocks | null> => {
  const finality = await fetchBlocksAndCheckFinality(
    l1Provider ?? outboxProvider,
    inboxProvider,
    epoch,
    epochPeriod,
    emitter
  );
  // Checked before destructuring: this returns undefined on an unresolvable
  // chain state, and destructuring that throws past every caller's guard.
  if (!finality) {
    emitter.emit(BotEvents.FINALITY_ISSUE, epoch);
    return null;
  }
  const [inboxFinalized, , finalityIssueFlagArb, finalityIssueFlagEth, fallback] = finality;
  if (finalityIssueFlagArb) {
    emitter.emit(BotEvents.FINALITY_ISSUE, epoch);
    return null;
  }

  const epochBoundary = (epoch + 1) * epochPeriod;
  if (finalityIssueFlagEth) {
    // Decision [O4]: L1 finality has stalled, so `finalized` stops moving. Decide from the
    // fallback block once no sequencer backdating can reach epoch E any more.
    if (!fallback || fallback.l1Confirmations < FALLBACK_L1_CONFIRMATIONS) {
      emitter.emit(BotEvents.FINALITY_ISSUE, epoch);
      return null;
    }
    const fallbackBoundary = epochBoundary + fallback.sequencerDelayLimit;
    if (!(fallback.inboxBlock.timestamp >= fallbackBoundary)) {
      emitter.emit(BotEvents.EPOCH_NOT_SETTLED, epoch, fallback.inboxBlock.timestamp, fallbackBoundary);
      return null;
    }
    const outboxBlock = (await getOutboxReadBlock({ outboxProvider, emitter })).number;
    emitter.emit(BotEvents.FINALITY_FALLBACK, {
      epoch,
      inboxBlock: fallback.inboxBlock.number,
      inboxTimestamp: fallback.inboxBlock.timestamp,
      l1Confirmations: fallback.l1Confirmations,
    });
    return { inboxBlock: fallback.inboxBlock.number, outboxBlock };
  }

  if (inboxFinalized.timestamp < epochBoundary) {
    emitter.emit(BotEvents.EPOCH_NOT_SETTLED, epoch, inboxFinalized.timestamp, epochBoundary);
    return null;
  }

  const outboxBlock = (await getOutboxReadBlock({ outboxProvider, emitter })).number;
  return { inboxBlock: inboxFinalized.number, outboxBlock };
};

export interface OutboxReadBlockParams {
  outboxProvider: JsonRpcProvider;
  emitter?: typeof defaultEmitter;
}

// Outbox chains (by `getNetwork().chainId`) whose finality stall has been alerted and not yet
// cleared. Run-001 #13: one `OUTBOX_FINALITY_STALLED` per stall and chain, one
// `OUTBOX_FINALITY_RECOVERED` when it clears, however many reads happen in between.
const stalledOutboxChains = new Set<number>();

/** Test-only: forget every chain marked stalled, so each test starts with no stall alerted. */
export const resetOutboxStallAlerts = (): void => {
  stalledOutboxChains.clear();
};

/**
 * The outbox chain's id, or undefined when the provider has no `getNetwork`, it fails or it
 * answers without a usable chain id. Undefined only skips the alert de-duplication.
 */
const outboxChainIdOf = async (outboxProvider: JsonRpcProvider): Promise<number | undefined> => {
  try {
    if (typeof (outboxProvider as any).getNetwork !== "function") return undefined;
    const network = await outboxProvider.getNetwork();
    const chainId = Number(network?.chainId);
    return Number.isSafeInteger(chainId) ? chainId : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The outbox-chain block every outbox read is pinned to (`claimHashes`, `stateRoot`, the
 * `Claimed` / `Challenged` / `VerificationStarted` scans).
 *
 * Frozen interface (validator-v1-fixes seed). It is the outbox chain's `finalized` block,
 * except while that chain's finality has stalled (its `finalized` block is more than
 * `FINALITY_STALL_SECS` behind `latest` by block timestamps): then decision [O4] reads at
 * `latest` minus 64 blocks, so claims made during the stall stay visible. Callers read the
 * outbox head through this function, never through `getBlock("finalized")` directly, so
 * the stall rule lives in one place.
 *
 * The stall is alerted once per chain when it starts (`ALERT` `OUTBOX_FINALITY_STALLED`) and
 * once when it clears (`OUTBOX_FINALITY_RECOVERED`), keyed by `getNetwork().chainId`, which is
 * only asked for when a stall is seen or some chain is marked stalled. Without a chain id the
 * stall alert is emitted on every stalled read, as before.
 *
 * @returns The block's number and timestamp
 */
export const getOutboxReadBlock = async ({
  outboxProvider,
  emitter = defaultEmitter,
}: OutboxReadBlockParams): Promise<{ number: number; timestamp: number }> => {
  const finalized = await outboxProvider.getBlock("finalized");
  const latest = await outboxProvider.getBlock("latest");
  // No head to compare against is no evidence of a stall: keep the finalized block.
  if (!latest) return { number: finalized.number, timestamp: finalized.timestamp };
  const stalledBySecs = latest.timestamp - finalized.timestamp;
  // A stall only ever moves the read block forward: when latest - 64 is not newer than
  // finalized, finalized is both the newer and the safer block.
  if (stalledBySecs > FINALITY_STALL_SECS && latest.number - OUTBOX_STALL_DEPTH_BLOCKS > finalized.number) {
    const block = await outboxProvider.getBlock(latest.number - OUTBOX_STALL_DEPTH_BLOCKS);
    const chainId = await outboxChainIdOf(outboxProvider);
    if (chainId === undefined || !stalledOutboxChains.has(chainId)) {
      if (chainId !== undefined) stalledOutboxChains.add(chainId);
      emitter.emit(BotEvents.ALERT, {
        level: "warn",
        code: "OUTBOX_FINALITY_STALLED",
        ...(chainId !== undefined ? { chainId } : {}),
        details: { finalizedBlock: finalized.number, stalledBySecs, readBlock: block.number },
      });
    }
    return { number: block.number, timestamp: block.timestamp };
  }
  // Recovered only once finalized is back within the stall bound; the edge case above (a lag in
  // seconds but fewer than 64 blocks) neither starts nor clears a stall.
  if (stalledBySecs <= FINALITY_STALL_SECS && stalledOutboxChains.size > 0) {
    const chainId = await outboxChainIdOf(outboxProvider);
    if (chainId !== undefined && stalledOutboxChains.delete(chainId)) {
      emitter.emit(BotEvents.ALERT, {
        level: "warn",
        code: "OUTBOX_FINALITY_RECOVERED",
        chainId,
        details: { finalizedBlock: finalized.number, stalledBySecs },
      });
    }
  }
  return { number: finalized.number, timestamp: finalized.timestamp };
};

/**
 * The sequencer's maximum backdating window, in seconds.
 *
 * `maxTimeVariation()` returns four values -- [delayBlocks, futureBlocks,
 * delaySeconds, futureSeconds] -- so coercing the whole result yields NaN, which
 * then silently poisons every block range derived from it.
 *
 * @returns delaySeconds from the sequencer inbox
 */
const getSequencerDelaySeconds = async (sequencer: SequencerInbox): Promise<number> => {
  const { delaySeconds } = await sequencer.maxTimeVariation();
  return Number(delaySeconds);
};

export interface FinalityCheckDeps {
  /** The SequencerInbox on L1 (defaults to the one the Arbitrum SDK names for `ArbProvider`'s chain). */
  connectSequencer?: (ArbProvider: JsonRpcProvider, EthProvider: JsonRpcProvider) => Promise<SequencerInbox>;
  /** Arbitrum's NodeInterface precompile, read on `ArbProvider`. */
  connectNodeInterface?: (ArbProvider: JsonRpcProvider) => NodeInterface;
}

const connectSequencerInbox = async (
  ArbProvider: JsonRpcProvider,
  EthProvider: JsonRpcProvider
): Promise<SequencerInbox> => {
  const l2Network = await getArbitrumNetwork(ArbProvider);
  return SequencerInbox__factory.connect(l2Network.ethBridge.sequencerInbox, EthProvider);
};

const connectNodeInterface = (ArbProvider: JsonRpcProvider): NodeInterface =>
  NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, ArbProvider);

// ethers v5 decodes uint256 as BigNumber; fakes may hand back plain numbers.
const toNumber = (value: any): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value.toNumber === "function") return value.toNumber();
  return undefined;
};

/**
 * This function checks the finality of the blocks on Arbitrum and Ethereum.
 * It returns the finalized block on Arbitrum and Ethereum and flags indicating finality issues.
 *
 * Every time judgement here is taken from chain blocks (Ethereum's `latest` timestamp), never
 * from the host clock (PRD 4.2).
 *
 * @param EthProvider Ethereum (Arbitrum's L1) provider
 * @param ArbProvider Arbitrum provider
 * @param veaEpoch epoch number of the claim to be fetched
 * @param veaEpochPeriod epoch period of the claim to be fetched
 *
 * @returns [Arbitrum finalized block, Ethereum finalized block, finalityIssueFlagArb, finalityIssueFlagEth,
 *   decision [O4] fallback (only while the Ethereum flag alone is set)], or undefined when neither the
 *   finalized nor the latest Arbitrum block can be found on L1
 * */
const getBlocksAndCheckFinality = async (
  EthProvider: JsonRpcProvider,
  ArbProvider: JsonRpcProvider,
  veaEpoch: number,
  veaEpochPeriod: number,
  emitter: typeof defaultEmitter,
  {
    connectSequencer = connectSequencerInbox,
    connectNodeInterface: connectNI = connectNodeInterface,
  }: FinalityCheckDeps = {}
): Promise<FinalityCheck | undefined> => {
  const sequencer = await connectSequencer(ArbProvider, EthProvider);
  const nodeInterface = connectNI(ArbProvider);
  const maxDelaySeconds = await getSequencerDelaySeconds(sequencer);
  const blockFinalizedArb = (await ArbProvider.getBlock("finalized")) as Block;
  const blockFinalizedEth = (await EthProvider.getBlock("finalized")) as Block;
  // ETH POS time: the L1 head's timestamp stands in for "now", not the host clock.
  const blockLatestEth = (await EthProvider.getBlock("latest")) as Block;
  const chainNow = blockLatestEth.timestamp;
  const currentEpoch = Math.floor(chainNow / veaEpochPeriod);

  // Fast path for old epochs: the finalized Arbitrum block already settles them. It must be
  // past the epoch's end, or a stalled L1 would hide behind a "no issue" answer here.
  if (
    currentEpoch - veaEpoch > 2 &&
    blockFinalizedArb.timestamp >= (veaEpoch + 1) * veaEpochPeriod &&
    blockFinalizedEth.timestamp > veaEpoch * veaEpochPeriod
  ) {
    return [blockFinalizedArb, blockFinalizedEth, false, false];
  }

  let finalityIssueFlagArb = false;
  let finalityIssueFlagEth = false;

  // Note: Using last finalized block as a proxy for the latest finalized epoch
  // Using a BeaconChain RPC would be more accurate
  if (chainNow - blockFinalizedEth.timestamp > FINALITY_STALL_SECS) {
    emitter.emit(BotEvents.FINALITY_ERROR, "Ethereum mainnet is experiencing finalization issues.");
    finalityIssueFlagEth = true;
  }

  // check latest arb block to see if there are any sequencer issues
  let blockLatestArb = (await ArbProvider.getBlock("latest")) as Block;

  const maxDelayInSeconds = 7 * 24 * 60 * 60; // 7 days
  const blockoldArb = (await ArbProvider.getBlock(blockLatestArb.number - 100)) as Block;
  const arbAverageBlockTime = (blockLatestArb.timestamp - blockoldArb.timestamp) / 100;
  const fromBlockArbFinalized = blockFinalizedArb.number - Math.ceil(maxDelayInSeconds / arbAverageBlockTime);
  // to performantly query the sequencerInbox's SequencerBatchDelivered event on Eth, we limit the block range
  // we use the heuristic that. delta blocknumber <= delta timestamp / secondsPerSlot
  // Arb: -----------x                   <-- Finalized
  //                 ||
  //                 \/
  // Eth: -------------------------x     <-- Finalized
  //            /\
  //            ||<---------------->     <-- Math.floor((timeDiffBlockFinalizedArbL1 + maxDelaySeconds) / secondsPerSlotEth)
  //         fromBlockEth

  const timeDiffBlockFinalizedArbL1 = blockFinalizedEth.timestamp - blockFinalizedArb.timestamp;
  const fromBlockEthFinalized =
    blockFinalizedEth.number - Math.floor((timeDiffBlockFinalizedArbL1 + maxDelaySeconds) / secondsPerSlotEth);

  const blockFinalizedArbToL1Block = await ArbBlockToL1Block(
    nodeInterface,
    sequencer,
    blockFinalizedArb,
    fromBlockEthFinalized,
    fromBlockArbFinalized,
    false,
    blockLatestEth.number
  );

  if (!blockFinalizedArbToL1Block) {
    emitter.emit(BotEvents.FINALITY_ERROR, "Arbitrum finalized block is not found on L1.");
    finalityIssueFlagArb = true;
  } else if (Math.abs(blockFinalizedArbToL1Block[0].timestamp - blockFinalizedArb.timestamp) > 1800) {
    // The L2 timestamp is drifted from the L1 timestamp in which the L2 block is posted.
    emitter.emit(BotEvents.FINALITY_ERROR, "Finalized L2 block time is more than 30 min drifted from L1 clock.");
  }

  // blockLatestArbToL1Block[0] is the L1 block, blockLatestArbToL1Block[1] is the L2 block (fallsback on latest L2 block if L2 block is not found on L1)
  const blockLatestArbToL1Block = await ArbBlockToL1Block(
    nodeInterface,
    sequencer,
    blockLatestArb,
    fromBlockEthFinalized,
    fromBlockArbFinalized,
    true,
    blockLatestEth.number
  );

  if (!blockLatestArbToL1Block) {
    emitter.emit(BotEvents.FINALITY_ERROR, "Arbitrum latest block is not found on L1.");
    // Neither mapping resolved: some issue in the arbitrum node implementation (very bad)
    if (finalityIssueFlagArb) return undefined;
    // Without the latest mapping the sequencer cannot be judged: flag it, never dereference it.
    return [blockFinalizedArb, blockFinalizedEth, true, finalityIssueFlagEth];
  }

  // is blockLatestArb is not found on L1, ArbBlockToL1Block fallsback on the latest L2 block found on L1
  if (blockLatestArbToL1Block[1] != blockLatestArb.number) {
    blockLatestArb = (await ArbProvider.getBlock(blockLatestArbToL1Block[1])) as Block;
  }

  // The sequencer is completely offline
  if (chainNow - blockLatestArbToL1Block[0].timestamp > 1800) {
    emitter.emit(
      BotEvents.FINALITY_ERROR,
      "Arbitrum sequencer is offline (from L1 'latest' POV) for atleast 30 minutes."
    );
    finalityIssueFlagArb = true;
  }

  // The L2 timestamp is drifted from the L1 timestamp in which the L2 block is posted.
  // Not necessarily a problem, but we should know about it
  if (Math.abs(blockLatestArbToL1Block[0].timestamp - blockLatestArb.timestamp) > 1800) {
    emitter.emit(
      BotEvents.FINALITY_ERROR,
      `Latest L2 block time is more than 30 min drifted from L1 clock. \n L2 block time: ${blockLatestArb.timestamp}, L1 block time: ${blockLatestArbToL1Block[0].timestamp}, L2 block number: ${blockLatestArb.number}`
    );
  }

  if (blockFinalizedArbToL1Block && blockFinalizedEth.number < blockFinalizedArbToL1Block[0].number) {
    emitter.emit(
      BotEvents.FINALITY_ERROR,
      "Arbitrum 'finalized' block is posted in an L1 block which is not finalized. Arbitrum node is out of sync with L1 node. It's recommended to use the same L1 RPC as the L1 node used by the Arbitrum node."
    );
    finalityIssueFlagArb = true;
  }

  if (finalityIssueFlagEth && !finalityIssueFlagArb) {
    const fallback = await findFinalityFallback({
      ArbProvider,
      nodeInterface,
      sequencer,
      latestEthNumber: blockLatestEth.number,
      fromBlockEth: fromBlockEthFinalized,
      fromArbBlock: blockFinalizedArb.number,
      toArbBlock: blockLatestArbToL1Block[1],
      sequencerDelayLimit: maxDelaySeconds,
    });
    return [blockFinalizedArb, blockFinalizedEth, finalityIssueFlagArb, finalityIssueFlagEth, fallback];
  }
  // Always the finalized block: it is the one proven above to sit in a batch
  // delivered by a finalized L1 block. blockLatestArb carries the unfinalized
  // tail, and callers stake deposits on whatever is returned here.
  return [blockFinalizedArb, blockFinalizedEth, finalityIssueFlagArb, finalityIssueFlagEth];
};

interface FinalityFallbackParams {
  ArbProvider: JsonRpcProvider;
  nodeInterface: NodeInterface;
  sequencer: SequencerInbox;
  latestEthNumber: number;
  fromBlockEth: number;
  fromArbBlock: number;
  toArbBlock: number;
  sequencerDelayLimit: number;
}

/**
 * Decision [O4]: the newest Arbitrum block whose L1 batch has at least
 * `FALLBACK_L1_CONFIRMATIONS` L1 confirmations.
 *
 * The newest batch delivered at or before L1 block `latest - 64` is found on L1, then the last
 * Arbitrum block in a batch no newer than it is found by bisecting `findBatchContainingBlock`
 * on Arbitrum. Each read runs on its own chain; a lookup that fails counts as "not posted",
 * which only moves the answer to an older, more confirmed block.
 *
 * @returns The fallback block, or undefined when none can be established
 */
const findFinalityFallback = async ({
  ArbProvider,
  nodeInterface,
  sequencer,
  latestEthNumber,
  fromBlockEth,
  fromArbBlock,
  toArbBlock,
  sequencerDelayLimit,
}: FinalityFallbackParams): Promise<FinalityFallback | undefined> => {
  const deepestL1Block = latestEthNumber - FALLBACK_L1_CONFIRMATIONS;
  const batchLog = await findLatestLog({
    contract: sequencer,
    filter: sequencer.filters.SequencerBatchDelivered(),
    fromBlock: fromBlockEth,
    toBlock: deepestL1Block,
  });
  const batch = toNumber(batchLog?.args?.batchSequenceNumber ?? batchLog?.args?.[0]);
  if (!batchLog || batch === undefined) return undefined;

  const batchOf = async (l2Block: number): Promise<number | undefined> => {
    try {
      const result = (await nodeInterface.functions.findBatchContainingBlock(l2Block)) as any;
      return toNumber(result?.batch);
    } catch {
      return undefined;
    }
  };
  const isConfirmed = async (l2Block: number): Promise<boolean> => {
    const l2Batch = await batchOf(l2Block);
    return l2Batch !== undefined && l2Batch <= batch;
  };

  if (!(await isConfirmed(fromArbBlock))) return undefined;
  let low = fromArbBlock; // invariant: low is confirmed
  let high = Math.max(toArbBlock, fromArbBlock);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (await isConfirmed(mid)) low = mid;
    else high = mid - 1;
  }

  const inboxBlock = (await ArbProvider.getBlock(low)) as Block;
  return { inboxBlock, l1Confirmations: latestEthNumber - batchLog.blockNumber, sequencerDelayLimit };
};

/**
 *
 * This function finds the corresponding L1(Eth) block for a given L2(Arb) block.
 *
 * @param nodeInterface Arbitrum NodeInterface
 * @param sequencer Arbitrum sequencerInbox
 * @param L2Block L2 block
 * @param fromBlockEth from block number on Eth
 * @param fromArbBlock from block number on Arb
 * @param fallbackLatest fallback to latest L2 block if the L2 block is not found on L1
 * @param toBlockEth the L1 head the scan stops at
 *
 * @returns [L1Block, L2BlockNumberFallback], or undefined when the batch or its delivery is unknown
 */

const ArbBlockToL1Block = async (
  nodeInterface: NodeInterface,
  sequencer: SequencerInbox,
  L2Block: Block,
  fromBlockEth: number,
  fromArbBlock: number,
  fallbackLatest: boolean,
  toBlockEth: number
): Promise<[Block, number] | undefined> => {
  let latestL2batchOnEth: number | undefined;
  let latestL2BlockNumberOnEth: number | undefined;
  const result = (await nodeInterface.functions
    .findBatchContainingBlock(L2Block.number, { blockTag: "latest" })
    .catch(async () => {
      // If the L2Block is the latest ArbBlock this will always throw, so we fallback to finding the latest L2 batch and block
      if (!fallbackLatest) return undefined;
      const latest = await findLatestL2BatchAndBlock(nodeInterface, fromArbBlock, L2Block.number).catch(
        () => undefined
      );
      if (latest) [latestL2batchOnEth, latestL2BlockNumberOnEth] = latest;
      return undefined;
    })) as any;

  const batch = toNumber(result?.batch) ?? latestL2batchOnEth;
  // An undefined batch would make SequencerBatchDelivered(undefined) match any batch, and an
  // unrelated batch would then pass as proof that this block was posted (PRD 2.4).
  if (batch === undefined) return undefined;
  const L2BlockNumberFallback = latestL2BlockNumberOnEth ?? L2Block.number;
  /**
   * We use the batch number to query the L1 sequencerInbox's SequencerBatchDelivered event
   * then, we get its emitted transaction hash.
   */
  const emittedEvent = await findFirstLog({
    contract: sequencer,
    filter: sequencer.filters.SequencerBatchDelivered(batch),
    fromBlock: fromBlockEth,
    toBlock: toBlockEth,
  });
  if (!emittedEvent) {
    return undefined;
  }

  const L1Block = (await emittedEvent.getBlock()) as Block;
  return [L1Block, L2BlockNumberFallback];
};

/**
 * This function finds the latest L2 batch and block number that has a corresponding batch on L1.
 *
 * @param nodeInterface Arbitrum NodeInterface
 * @param fromArbBlock from block number on Arb
 * @param latestBlockNumber latest block number on Arb
 *
 * @returns [latest L2 batch number, latest L2 block number]
 */

const findLatestL2BatchAndBlock = async (
  nodeInterface: NodeInterface,
  fromArbBlock: number,
  latestBlockNumber: number
): Promise<[number, number]> => {
  let low = fromArbBlock;
  let high = latestBlockNumber;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      (await nodeInterface.functions.findBatchContainingBlock(mid)) as any;
      low = mid + 1;
    } catch (e) {
      high = mid - 1;
    }
  }

  // high is now the latest L2 block number that has a corresponding batch on L1
  const result = (await nodeInterface.functions.findBatchContainingBlock(high)) as any;
  return [toNumber(result.batch), high];
};

export { getBlocksAndCheckFinality, getSequencerDelaySeconds, ArbBlockToL1Block };
