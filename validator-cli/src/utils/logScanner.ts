export const DEFAULT_CHUNK_SIZE = 1000;
export const MIN_CHUNK_SIZE = 32;

export type ScanDirection = "forward" | "backward";

export interface ScanLogsParams {
  contract: any;
  filter: any;
  fromBlock: number;
  toBlock: number;
  chunkSize?: number;
  minChunkSize?: number;
  direction?: ScanDirection;
  stopOnFirstHit?: boolean;
}

const logOrder = (a: any, b: any): number =>
  a.blockNumber - b.blockNumber || (a.index ?? a.logIndex ?? 0) - (b.index ?? b.logIndex ?? 0);

/**
 * Query a contract's logs over a block range in bounded chunks.
 *
 * Every provider caps `eth_getLogs` at some range width, and the cap differs
 * between providers. Rather than hardcode a guess, the scanner starts at
 * `chunkSize` and halves it whenever the provider rejects a chunk, keeping the
 * narrowed size for the rest of the scan. Below `minChunkSize` the provider
 * error is rethrown, so a genuinely broken endpoint still surfaces.
 */
export const scanLogs = async ({
  contract,
  filter,
  fromBlock,
  toBlock,
  chunkSize = DEFAULT_CHUNK_SIZE,
  minChunkSize = MIN_CHUNK_SIZE,
  direction = "forward",
  stopOnFirstHit = false,
}: ScanLogsParams): Promise<any[]> => {
  const logs: any[] = [];
  if (toBlock < fromBlock) return logs;

  const forward = direction === "forward";
  let size = chunkSize;
  let cursor = forward ? fromBlock : toBlock;

  while (forward ? cursor <= toBlock : cursor >= fromBlock) {
    const lo = forward ? cursor : Math.max(cursor - size + 1, fromBlock);
    const hi = forward ? Math.min(cursor + size - 1, toBlock) : cursor;
    try {
      const chunk = await contract.queryFilter(filter, lo, hi);
      logs.push(...chunk);
      if (stopOnFirstHit && chunk.length > 0) break;
      cursor = forward ? hi + 1 : lo - 1;
    } catch (error) {
      if (size <= minChunkSize) throw error;
      size = Math.max(Math.floor(size / 2), minChunkSize);
    }
  }

  return logs.sort(logOrder);
};

export type FindLogParams = Omit<ScanLogsParams, "direction" | "stopOnFirstHit">;

/** The oldest log matching `filter` in `[fromBlock, toBlock]`, or null if there is none. */
export const findFirstLog = async (params: FindLogParams): Promise<any | null> => {
  const logs = await scanLogs({ ...params, direction: "forward", stopOnFirstHit: true });
  return logs[0] ?? null;
};

/**
 * The newest log matching `filter` in `[fromBlock, toBlock]`, or null if there is none.
 *
 * `fromBlock` is a required floor rather than an optional one: without it a
 * "latest event ever" lookup walks back to genesis on a chain where the event
 * may simply never have been emitted.
 */
export const findLatestLog = async (params: FindLogParams): Promise<any | null> => {
  const logs = await scanLogs({ ...params, direction: "backward", stopOnFirstHit: true });
  return logs[logs.length - 1] ?? null;
};
