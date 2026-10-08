/**
 * A fake Arbitrum batch-posting model on top of the frozen two-chain fixture.
 *
 * Arbitrum blocks are grouped into batches of `BATCH_BLOCKS`; batch k is delivered to L1 in the
 * first L1 block at least `POST_DELAY_SECS` after its last Arbitrum block. The fake
 * `SequencerInbox` lives on the L1 chain and the fake `NodeInterface` on the Arbitrum chain, and
 * both check every block number against their own chain (the fixture throws
 * `WrongChainBlockError` otherwise).
 */
import { FakeChain } from "../../testUtils/twoChainFixture";

export const BATCH_BLOCKS = 400; // 100 s of Arbitrum Sepolia blocks
export const POST_DELAY_SECS = 30;
export const SEQUENCER_DELAY_SECS = 86_400;

const big = (n: number) => ({ toNumber: () => n });

export interface FakeArbitrumL1 {
  sequencer: any;
  nodeInterface: any;
  /** The batch an Arbitrum block belongs to. */
  batchOf(l2Block: number): number;
  /** The L1 block that delivers batch k, or undefined while it is not delivered yet. */
  deliveryBlock(batch: number): number | undefined;
  /** Every `[fromBlock, toBlock]` range queried on the L1 sequencer. */
  l1Scans: Array<[number, number]>;
  /** Every block number `findBatchContainingBlock` was asked about. */
  batchLookups: number[];
  /** Knobs: make a batch lookup throw, or hide a batch's delivery event. */
  failBatchLookup: (l2Block: number) => boolean;
  hideDelivery: (batch: number) => boolean;
}

export const createFakeArbitrumL1 = ({ arb, l1 }: { arb: FakeChain; l1: FakeChain }): FakeArbitrumL1 => {
  const first = arb.options.firstBlock;
  const batchOf = (n: number) => Math.floor((n - first) / BATCH_BLOCKS);
  const lastBlockOf = (k: number) => first + (k + 1) * BATCH_BLOCKS - 1;

  const deliveryBlock = (k: number): number | undefined => {
    const end = lastBlockOf(k);
    if (end > arb.resolve("latest")) return undefined;
    const postTs = arb.block(end).timestamp + POST_DELAY_SECS;
    const head = l1.block("latest");
    if (postTs > head.timestamp) return undefined;
    return head.number - Math.floor((head.timestamp - postTs) / l1.options.secondsPerBlock);
  };

  const batchAtTime = (t: number) => {
    const head = arb.block("latest");
    const n = head.number - Math.floor((head.timestamp - t) / arb.options.secondsPerBlock);
    return Math.max(batchOf(Math.max(n, first)), 0);
  };

  const fake: FakeArbitrumL1 = {
    batchOf,
    deliveryBlock,
    l1Scans: [],
    batchLookups: [],
    failBatchLookup: () => false,
    hideDelivery: () => false,
    nodeInterface: {
      functions: {
        findBatchContainingBlock: async (l2Block: number) => {
          fake.batchLookups.push(l2Block);
          arb.assertOwnBlock(l2Block);
          const k = batchOf(l2Block);
          if (fake.failBatchLookup(l2Block) || deliveryBlock(k) === undefined) {
            throw new Error(`block ${l2Block} is not in a delivered batch`);
          }
          return { batch: big(k) };
        },
      },
    },
    sequencer: {
      provider: l1.provider,
      maxTimeVariation: async () => ({
        delayBlocks: 7200,
        futureBlocks: 64,
        delaySeconds: SEQUENCER_DELAY_SECS,
        futureSeconds: 768,
      }),
      filters: {
        SequencerBatchDelivered: (batch?: any) => ({
          batch: batch === undefined || batch === null ? undefined : Number(batch),
        }),
      },
      queryFilter: async (filter: { batch?: number }, from: number, to: number) => {
        l1.assertOwnBlock(from);
        l1.assertOwnBlock(to);
        fake.l1Scans.push([from, to]);
        let candidates: number[];
        if (filter.batch !== undefined) {
          candidates = [filter.batch];
        } else {
          const lo = Math.max(batchAtTime(l1.block(from).timestamp - 60) - 2, 0);
          const hi = batchAtTime(l1.block(to).timestamp) + 2;
          candidates = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
        }
        return candidates
          .filter((k) => !fake.hideDelivery(k))
          .map((k) => ({ k, at: deliveryBlock(k) }))
          .filter(({ at }) => at !== undefined && at >= from && at <= to)
          .map(({ k, at }) => ({
            blockNumber: at!,
            args: { batchSequenceNumber: big(k) },
            getBlock: async () => l1.block(at!),
          }));
      },
    },
  };
  return fake;
};
