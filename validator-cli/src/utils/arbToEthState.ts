import { JsonRpcProvider, Block } from "@ethersproject/providers";
import { SequencerInbox } from "@arbitrum/sdk/dist/lib/abi/SequencerInbox";
import { NodeInterface__factory } from "@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory";
import { NodeInterface } from "@arbitrum/sdk/dist/lib/abi/NodeInterface";
import { NODE_INTERFACE_ADDRESS } from "@arbitrum/sdk/dist/lib/dataEntities/constants";
import { getArbitrumNetwork } from "@arbitrum/sdk";
import { SequencerInbox__factory } from "@arbitrum/sdk/dist/lib/abi/factories/SequencerInbox__factory";

// https://github.com/prysmaticlabs/prysm/blob/493905ee9e33a64293b66823e69704f012b39627/config/params/mainnet_config.go#L103
const slotsPerEpochEth = 32;
const secondsPerSlotEth = 12;

const getBlocksAndCheckFinality = async (
  EthProvider: JsonRpcProvider,
  ArbProvider: JsonRpcProvider,
  veaEpoch: number,
  veaEpochPeriod: number
): Promise<[Block, Block, Boolean] | undefined> => {
  const currentEpoch = Math.floor(Date.now() / 1000 / veaEpochPeriod);

  const l2Network = await getArbitrumNetwork(ArbProvider);
  const sequencer = SequencerInbox__factory.connect(l2Network.ethBridge.sequencerInbox, EthProvider);
  const maxDelaySeconds = Number(await sequencer.maxTimeVariation());
  const blockFinalizedArb = (await ArbProvider.getBlock("finalized")) as Block;
  const blockFinalizedEth = (await EthProvider.getBlock("finalized")) as Block;
  if (
    currentEpoch - veaEpoch > 2 &&
    blockFinalizedArb.timestamp > veaEpoch * veaEpochPeriod &&
    blockFinalizedEth.timestamp > veaEpoch * veaEpochPeriod
  ) {
    return [blockFinalizedArb, blockFinalizedEth, false];
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
    console.error("Arbitrum finalized block is not found on L1.");
    finalityIssueFlagArb = true;
  } else if (Math.abs(blockFinalizedArbToL1Block[0].timestamp - blockFinalizedArb.timestamp) > 1800) {
    // The L2 timestamp is drifted from the L1 timestamp in which the L2 block is posted.
    console.error("Finalized L2 block time is more than 30 min drifted from L1 clock.");
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
    console.error("Arbitrum latest block is not found on L1.");
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
  // Not necessarily a problem, but we should know about it
  if (localTimeSeconds - blockLatestArbToL1Block[0].timestamp > 1800) {
    console.error("Arbitrum sequencer is offline (from L1 'latest' POV) for atleast 30 minutes.");
  }

  // The L2 timestamp is drifted from the L1 timestamp in which the L2 block is posted.
  // Not necessarily a problem, but we should know about it
  if (Math.abs(blockLatestArbToL1Block[0].timestamp - blockLatestArb.timestamp) > 1800) {
    console.error("Latest L2 block time is more than 30 min drifted from L1 clock.");
    console.error("L2 block time: " + blockLatestArb.timestamp);
    console.error("L1 block time: " + blockLatestArbToL1Block[0].timestamp);
    console.error("L2 block number: " + blockLatestArb.number);
  }

  // Note: Using last finalized block as a proxy for the latest finalized epoch
  // Using a BeaconChain RPC would be more accurate
  if (localTimeSeconds - blockFinalizedEth.timestamp > maxFinalityTimeSecondsEth + finalityBuffer) {
    console.error("Ethereum mainnet is not finalizing");
    finalityIssueFlagEth = true;
  }

  if (blockFinalizedEth.number < blockFinalizedArbToL1Block[0].number) {
    console.error(
      "Arbitrum 'finalized' block is posted in an L1 block which is not finalized. Arbitrum node is out of sync with L1 node. It's recommended to use the same L1 RPC as the L1 node used by the Arbitrum node."
    );
    finalityIssueFlagArb = true;
  }
  // if L1 is experiencing finalization problems, we use the latest L2 block
  // we could
  const blockArbitrum = finalityIssueFlagArb || finalityIssueFlagEth ? blockFinalizedArb : blockLatestArb;

  return [blockArbitrum, blockFinalizedEth, finalityIssueFlagEth];
};

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
    .catch((e) => {
      // If the L2Block is the latest ArbBlock this will always throw an error
      console.log("Error finding batch containing block, searching heuristically...");
    })) as any;

  if (!result) {
    if (!fallbackLatest) {
      return undefined;
    } else {
      [latestL2batchOnEth, latestL2BlockNumberOnEth] = await findLatestL2BatchAndBlock(
        nodeInterface,
        fromArbBlock,
        L2Block.number
      );
    }
  }

  const batch = result?.batch?.toNumber() ?? latestL2batchOnEth;
  const L2BlockNumberFallback = latestL2BlockNumberOnEth ?? L2Block.number;
  /**
   * We use the batch number to query the L1 sequencerInbox's SequencerBatchDelivered event
   * then, we get its emitted transaction hash.
   */
  const queryBatch = sequencer.filters.SequencerBatchDelivered(batch);

  const emittedEvent = await sequencer.queryFilter(queryBatch, fromBlockEth, "latest");
  if (emittedEvent.length == 0) {
    return undefined;
  }

  const L1Block = (await emittedEvent[0].getBlock()) as Block;
  return [L1Block, L2BlockNumberFallback];
};

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

export { getBlocksAndCheckFinality };
