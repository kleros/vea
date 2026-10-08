/**
 * Two-chain test fixture (validator-v1-fixes seed, frozen).
 *
 * The Arbitrum Sepolia -> Chiado route (outbox chain 10200) talks to three chains: the inbox
 * on Arbitrum Sepolia, the outbox on Chiado and the router on Sepolia, which is also
 * Arbitrum's L1. Their block numbers live in disjoint ranges here, and every read pinned to
 * a block of the wrong chain throws `WrongChainBlockError`, so a test fails loudly when code
 * uses one chain's block number on another chain's contract.
 */

export class WrongChainBlockError extends Error {
  constructor(chain: string, block: number, first: number, head: number) {
    super(`${chain}: block ${block} is not a ${chain} block (this fixture's ${chain} spans ${first}..${head})`);
    this.name = "WrongChainBlockError";
  }
}

export type BlockTag = "latest" | "finalized" | "safe" | "earliest" | number | string;

export interface FakeBlock {
  number: number;
  timestamp: number;
  hash: string;
}

export interface FakeChainOptions {
  chainId: number;
  name: string;
  firstBlock: number;
  headBlock: number;
  headTimestamp: number;
  secondsPerBlock: number;
  /** How many blocks `finalized` trails `latest`. */
  finalizedLag: number;
  /** How many blocks `safe` trails `latest` (defaults to `finalizedLag`). */
  safeLag?: number;
}

export interface FakeChain {
  chainId: number;
  name: string;
  options: FakeChainOptions;
  /** A provider-shaped object: getBlock, getBlockNumber, getNetwork. Cast it where a JsonRpcProvider is typed. */
  provider: any;
  /** Resolve a tag or number to a block number of this chain, throwing WrongChainBlockError when it is not one. */
  resolve(tag: BlockTag): number;
  block(tag: BlockTag): FakeBlock;
  /** Throw WrongChainBlockError unless `blockNumber` lies in this chain's range. */
  assertOwnBlock(blockNumber: number): void;
  /** Move the head forward by `blocks` (the timestamp advances by secondsPerBlock each). */
  advance(blocks: number): void;
  /**
   * Wrap a contract read so a `{ blockTag }` override is checked against this chain.
   * The wrapped function receives the resolved block number (or "latest" when no tag was given).
   */
  pinned<A extends any[], R>(read: (blockNumber: number | "latest", ...args: A) => R): (...args: any[]) => Promise<R>;
}

export const createFakeChain = (options: FakeChainOptions): FakeChain => {
  const state = { head: options.headBlock, headTimestamp: options.headTimestamp };
  const safeLag = options.safeLag ?? options.finalizedLag;

  const timestampOf = (n: number) => Math.floor(state.headTimestamp - (state.head - n) * options.secondsPerBlock);

  const assertOwnBlock = (n: number) => {
    if (!Number.isInteger(n) || n < options.firstBlock || n > state.head) {
      throw new WrongChainBlockError(options.name, n, options.firstBlock, state.head);
    }
  };

  const resolve = (tag: BlockTag): number => {
    let n: number;
    if (tag === "latest") n = state.head;
    else if (tag === "finalized") n = state.head - options.finalizedLag;
    else if (tag === "safe") n = state.head - safeLag;
    else if (tag === "earliest") n = options.firstBlock;
    else if (typeof tag === "number") n = tag;
    else if (/^0x[0-9a-f]+$/i.test(tag)) n = parseInt(tag, 16);
    else if (/^\d+$/.test(tag)) n = Number(tag);
    else throw new Error(`${options.name}: unknown block tag ${tag}`);
    assertOwnBlock(n);
    return n;
  };

  const block = (tag: BlockTag): FakeBlock => {
    const n = resolve(tag);
    return {
      number: n,
      timestamp: timestampOf(n),
      hash: `0x${options.chainId.toString(16)}${n.toString(16).padStart(60, "0")}`,
    };
  };

  const isOverrides = (value: unknown): value is { blockTag?: BlockTag } =>
    typeof value === "object" && value !== null && !Array.isArray(value) && "blockTag" in (value as object);

  return {
    chainId: options.chainId,
    name: options.name,
    options,
    provider: {
      getBlock: async (tag: BlockTag) => block(tag),
      getBlockNumber: async () => state.head,
      getNetwork: async () => ({ chainId: options.chainId, name: options.name }),
    },
    resolve,
    block,
    assertOwnBlock,
    advance: (blocks: number) => {
      state.head += blocks;
      state.headTimestamp += Math.round(blocks * options.secondsPerBlock);
    },
    pinned:
      <A extends any[], R>(read: (blockNumber: number | "latest", ...args: A) => R) =>
      async (...args: any[]) => {
        const last = args[args.length - 1];
        if (isOverrides(last)) {
          const n = last.blockTag === undefined ? ("latest" as const) : resolve(last.blockTag);
          return read(n, ...(args.slice(0, -1) as A));
        }
        return read("latest", ...(args as A));
      },
  };
};

export interface TwoChainRoute {
  /** The outbox chain id the watcher keys this route by. */
  chainId: 10200;
  inbox: FakeChain; // Arbitrum Sepolia, 421614
  outbox: FakeChain; // Chiado, 10200
  router: FakeChain; // Sepolia, 11155111 (Arbitrum's L1)
}

/**
 * The Arbitrum Sepolia -> Chiado route with three chains whose block ranges never overlap:
 * Sepolia 8,000,000..9,000,000 (12 s), Chiado 15,000,000..18,000,000 (5 s) and Arbitrum Sepolia
 * 150,000,000..200,000,000 (0.25 s). All heads share `now` as their timestamp.
 */
export const createTwoChainRoute = ({ now = 1_760_000_000 }: { now?: number } = {}): TwoChainRoute => ({
  chainId: 10200,
  inbox: createFakeChain({
    chainId: 421614,
    name: "arbitrum-sepolia",
    firstBlock: 150_000_000,
    headBlock: 200_000_000,
    headTimestamp: now,
    secondsPerBlock: 0.25,
    finalizedLag: 4800, // ~20 min
  }),
  outbox: createFakeChain({
    chainId: 10200,
    name: "chiado",
    firstBlock: 15_000_000,
    headBlock: 18_000_000,
    headTimestamp: now,
    secondsPerBlock: 5,
    finalizedLag: 32,
  }),
  router: createFakeChain({
    chainId: 11155111,
    name: "sepolia",
    firstBlock: 8_000_000,
    headBlock: 9_000_000,
    headTimestamp: now,
    secondsPerBlock: 12,
    finalizedLag: 64, // ~13 min
  }),
});
