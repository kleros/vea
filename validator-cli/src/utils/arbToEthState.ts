import { JsonRpcProvider, Block } from "@ethersproject/providers";
import { SequencerInbox } from "@arbitrum/sdk/dist/lib/abi/SequencerInbox";
import { NodeInterface__factory } from "@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory";
import { NodeInterface } from "@arbitrum/sdk/dist/lib/abi/NodeInterface";
import { NODE_INTERFACE_ADDRESS } from "@arbitrum/sdk/dist/lib/dataEntities/constants";
import { getArbitrumNetwork } from "@arbitrum/sdk";
import { SequencerInbox__factory } from "@arbitrum/sdk/dist/lib/abi/factories/SequencerInbox__factory";
import { defaultEmitter } from "../utils/emitter";
import { BotEvents } from "../utils/botEvents";
import { findFirstLog } from "./logScanner";

// https://github.com/prysmaticlabs/prysm/blob/493905ee9e33a64293b66823e69704f012b39627/config/params/mainnet_config.go#L103
const slotsPerEpochEth = 32;
const secondsPerSlotEth = 12;

export interface SettledReadBlocks {
  inboxBlock: number;
  outboxBlock: number;
}

export interface ResolveSettledReadBlocksParams {
  inboxProvider: JsonRpcProvider;
  outboxProvider: JsonRpcProvider;
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
 * When either fails the epoch is simply not decidable yet: callers skip it and
 * try again next cycle rather than acting on unsettled state.
 *
 * @returns The blocks to pin reads to, or null if the epoch is not yet decidable
 */
export const resolveSettledReadBlocks = async ({
  inboxProvider,
  outboxProvider,
  epoch,
  epochPeriod,
  emitter = defaultEmitter,
  fetchBlocksAndCheckFinality = getBlocksAndCheckFinality,
}: ResolveSettledReadBlocksParams): Promise<SettledReadBlocks | null> => {
  const finality = await fetchBlocksAndCheckFinality(outboxProvider, inboxProvider, epoch, epochPeriod, emitter);
  // Checked before destructuring: this returns undefined on an unresolvable
  // chain state, and destructuring that throws past every caller's guard.
  if (!finality) {
    emitter.emit(BotEvents.FINALITY_ISSUE, epoch);
    return null;
  }
  const [inboxFinalized, outboxFinalized, finalityIssueFlagArb, finalityIssueFlagEth] = finality;
  if (finalityIssueFlagArb || finalityIssueFlagEth) {
    emitter.emit(BotEvents.FINALITY_ISSUE, epoch);
    return null;
  }

  const epochBoundary = (epoch + 1) * epochPeriod;
  if (inboxFinalized.timestamp < epochBoundary) {
    emitter.emit(BotEvents.EPOCH_NOT_SETTLED, epoch, inboxFinalized.timestamp, epochBoundary);
    return null;
  }

  return { inboxBlock: inboxFinalized.number, outboxBlock: outboxFinalized.number };
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

/**
 * This function checks the finality of the blocks on Arbitrum and Ethereum.
 * It returns the latest/finalized block on Arbitrum(found on Ethereum) and Ethereum and a flag indicating if there is a finality issue on Ethereum.
 *
 * @param EthProvider Ethereum provider
 * @param ArbProvider Arbitrum provider
 * @param veaEpoch epoch number of the claim to be fetched
 * @param veaEpochPeriod epoch period of the claim to be fetched
 *
 * @returns [Arbitrum block, Ethereum block, finalityIssueFlagArb, finalityIssueFlagEth]
 * */
const getBlocksAndCheckFinality = async (
  EthProvider: JsonRpcProvider,
  ArbProvider: JsonRpcProvider,
  veaEpoch: number,
  veaEpochPeriod: number,
  emitter: typeof defaultEmitter
): Promise<[Block, Block, boolean, boolean] | undefined> => {
  const currentEpoch = Math.floor(Date.now() / 1000 / veaEpochPeriod);

  const l2Network = await getArbitrumNetwork(ArbProvider);
  const sequencer = SequencerInbox__factory.connect(l2Network.ethBridge.sequencerInbox, EthProvider);
  const maxDelaySeconds = await getSequencerDelaySeconds(sequencer);
  const blockFinalizedArb = (await ArbProvider.getBlock("finalized")) as Block;
  const blockFinalizedEth = (await EthProvider.getBlock("finalized")) as Block;
  if (
    currentEpoch - veaEpoch > 2 &&
    blockFinalizedArb.timestamp > veaEpoch * veaEpochPeriod &&
    blockFinalizedEth.timestamp > veaEpoch * veaEpochPeriod
  ) {
    return [blockFinalizedArb, blockFinalizedEth, false, false];
  }
  const finalityBuffer = 300; // 5 minutes, allows for network delays
  const maxFinalityTimeSecondsEth = slotsPerEpochEth * 2 * secondsPerSlotEth; // finalization after 2 justified epochs

  let finalityIssueFlagArb = false;
  let finalityIssueFlagEth = false;

  // check latest arb block to see if there are any sequencer issues
  let blockLatestArb = (await ArbProvider.getBlock("latest")) as Block;

  const maxDelayInSeconds = 7 * 24 * 60 * 60; // 7 days
  let blockoldArb = (await ArbProvider.getBlock(blockLatestArb.number - 100)) as Block;
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

  let blockFinalizedArbToL1Block = await ArbBlockToL1Block(
    ArbProvider,
    sequencer,
    blockFinalizedArb,
    fromBlockEthFinalized,
    fromBlockArbFinalized,
    false
  );

  if (!blockFinalizedArbToL1Block) {
    emitter.emit(BotEvents.FINALITY_ERROR, "Arbitrum finalized block is not found on L1.");
    finalityIssueFlagArb = true;
  } else if (Math.abs(blockFinalizedArbToL1Block[0].timestamp - blockFinalizedArb.timestamp) > 1800) {
    // The L2 timestamp is drifted from the L1 timestamp in which the L2 block is posted.
    emitter.emit(BotEvents.FINALITY_ERROR, "Finalized L2 block time is more than 30 min drifted from L1 clock.");
  }

  // blockLatestArbToL1Block[0] is the L1 block, blockLatestArbToL1Block[1] is the L2 block (fallsback on latest L2 block if L2 block is not found on L1)
  let blockLatestArbToL1Block = await ArbBlockToL1Block(
    ArbProvider,
    sequencer,
    blockLatestArb,
    fromBlockEthFinalized,
    fromBlockArbFinalized,
    true
  );

  if (finalityIssueFlagArb && !blockLatestArbToL1Block) {
    emitter.emit(BotEvents.FINALITY_ERROR, "Arbitrum latest block is not found on L1.");
    // this means some issue in the arbitrum node implementation (very bad)
    return undefined;
  }

  // is blockLatestArb is not found on L1, ArbBlockToL1Block fallsback on the latest L2 block found on L1
  if (blockLatestArbToL1Block[1] != blockLatestArb.number) {
    blockLatestArb = (await ArbProvider.getBlock(blockLatestArbToL1Block[1])) as Block;
  }

  // ETH POS assumes synchronized clocks
  // using local time as a proxy for true "latest" L1 time
  const localTimeSeconds = Math.floor(Date.now() / 1000);

  // The sequencer is completely offline
  if (localTimeSeconds - blockLatestArbToL1Block[0].timestamp > 1800) {
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

  // Note: Using last finalized block as a proxy for the latest finalized epoch
  // Using a BeaconChain RPC would be more accurate
  if (localTimeSeconds - blockFinalizedEth.timestamp > maxFinalityTimeSecondsEth + finalityBuffer) {
    emitter.emit(BotEvents.FINALITY_ERROR, "Ethereum mainnet is experiencing finalization issues.");
    finalityIssueFlagEth = true;
  }

  if (blockFinalizedEth.number < blockFinalizedArbToL1Block[0].number) {
    emitter.emit(
      BotEvents.FINALITY_ERROR,
      "Arbitrum 'finalized' block is posted in an L1 block which is not finalized. Arbitrum node is out of sync with L1 node. It's recommended to use the same L1 RPC as the L1 node used by the Arbitrum node."
    );
    finalityIssueFlagArb = true;
  }
  // Always the finalized block: it is the one proven above to sit in a batch
  // delivered by a finalized L1 block. blockLatestArb carries the unfinalized
  // tail, and callers stake deposits on whatever is returned here.
  return [blockFinalizedArb, blockFinalizedEth, finalityIssueFlagArb, finalityIssueFlagEth];
};

/**
 *
 * This function finds the corresponding L1(Eth) block for a given L2(Arb) block.
 *
 * @param L2Provider Arbitrum provider
 * @param sequencer Arbitrum sequencerInbox
 * @param L2Block L2 block
 * @param fromBlockEth from block number on Eth
 * @param fromArbBlock from block number on Arb
 * @param fallbackLatest fallback to latest L2 block if the L2 block is not found on L1
 *
 * @returns [L1Block, L2BlockNumberFallback]
 */

const ArbBlockToL1Block = async (
  L2Provider: JsonRpcProvider,
  sequencer: SequencerInbox,
  L2Block: Block,
  fromBlockEth: number,
  fromArbBlock: number,
  fallbackLatest: boolean
): Promise<[Block, number] | undefined> => {
  const nodeInterface = NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, L2Provider);

  let latestL2batchOnEth: number;
  let latestL2BlockNumberOnEth: number;
  let result = (await nodeInterface.functions
    .findBatchContainingBlock(L2Block.number, { blockTag: "latest" })
    .catch(async (e) => {
      // If the L2Block is the latest ArbBlock this will always throw, so we fallback to finding the latest L2 batch and block
      if (!fallbackLatest) {
        return undefined;
      } else {
        [latestL2batchOnEth, latestL2BlockNumberOnEth] = await findLatestL2BatchAndBlock(
          nodeInterface,
          fromArbBlock,
          L2Block.number
        );
      }
    })) as any;

  const batch = result?.batch?.toNumber() ?? latestL2batchOnEth;
  const L2BlockNumberFallback = latestL2BlockNumberOnEth ?? L2Block.number;
  /**
   * We use the batch number to query the L1 sequencerInbox's SequencerBatchDelivered event
   * then, we get its emitted transaction hash.
   */
  const emittedEvent = await findFirstLog({
    contract: sequencer,
    filter: sequencer.filters.SequencerBatchDelivered(batch),
    fromBlock: fromBlockEth,
    toBlock: await sequencer.provider.getBlockNumber(),
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
  return [result.batch.toNumber(), high];
};

export { getBlocksAndCheckFinality, getSequencerDelaySeconds };
