import request from "graphql-request";
import { ClaimNotFoundError, NoMessageSavedError } from "./errors";
import { ClaimStruct } from "../../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { ethers } from "ethers";

// An indexer request is aborted (and rejects) after this long. node-fetch, under graphql-request,
// has no timeout of its own, so an indexer that accepts the connection and never answers would
// otherwise hang the sequential watch loop: later routes, heartbeats and shutdown all wait on it.
const INDEXER_TIMEOUT_MS = 30_000;

/** Every indexer request goes through here, so none can outlive `INDEXER_TIMEOUT_MS`. */
const indexerRequest = <T = any>(url: string, document: string): Promise<T> =>
  request<T>({ url, document, signal: AbortSignal.timeout(INDEXER_TIMEOUT_MS) });

interface ClaimData {
  epoch?: number;
  id: string;
  bridger: string;
  stateRoot: string;
  timestamp: number;
  challenged: boolean;
  txHash: string;
  verification?: {
    startTimestamp: number;
    startTxHash: string;
  }[];
  challenge?: {
    challenger: string;
  }[];
}

/**
 * Fetches the claim data for a given epoch (used for claimer - happy path)
 * @param epoch
 * @returns ClaimData
 * */
const getClaimForEpoch = async (epoch: number, outbox: string, chainId: number): Promise<ClaimData | undefined> => {
  try {
    const subgraph = process.env.ENVIO_URL!;

    const result = await indexerRequest(
      `${subgraph}`,
      `{
                        Claim(where: {epoch: {_eq: ${epoch}}, outbox: {id: {_eq: "${outbox}"}}}) {
                        id
                        bridger
                        stateRoot
                        timestamp
                        txHash
                        verification(order_by: {startTimestamp: desc}) {
                          startTimestamp
                          startTxHash
                        }
                        challenge {
                          challenger
                        }
                      }
          }`
    );
    return result[`Claim`][0];
  } catch (e) {
    console.log(e);
    throw new ClaimNotFoundError(epoch);
  }
};

/**
 * The start timestamp of the latest verification: `startVerification` can run again after a
 * failed censorship test, and the restarted one supersedes the earlier one (as in `getClaimForEpoch`).
 */
const latestVerificationStart = (verifications: ClaimData["verification"]): number =>
  (verifications ?? []).reduce(
    (latest, verification) => Math.max(latest, Number(verification?.startTimestamp ?? 0) || 0),
    0
  );

/** Fetches the claims data for a given list of epochs (used for claimer - happy path)
 * @param epochs
 * @param outbox
 * @param chainId
 * @returns ClaimData[]
 * */
const getClaimsForEpochs = async (
  epochs: number[],
  outbox: string,
  chainId: number
): Promise<Map<number, ClaimStruct | null>> => {
  try {
    const subgraph = process.env.ENVIO_URL!;
    const epochsString = epochs.join(", ");
    const query = `{
      Claim(where: {epoch: {_in: [${epochsString}]}, outbox: {id: {_eq: "${outbox}"}}}) {
        id
        bridger
        stateRoot
        timestamp
        txHash
        verification(order_by: {startTimestamp: desc}) {
          startTimestamp
          startTxHash
        }
        challenge {
          challenger
        }
        epoch
      }
    }`;

    const result: { Claim: ClaimData[] } = await indexerRequest(subgraph, query);
    // Map returned claims to corresponding epochs (some epochs may not have claims)
    const claimsByEpoch = new Map<number, ClaimStruct | null>();
    for (const claim of result.Claim) {
      if (claim.stateRoot === ethers.ZeroHash) {
        claimsByEpoch.set(claim.epoch, null);
        continue;
      }
      claimsByEpoch.set(claim.epoch, {
        stateRoot: claim.stateRoot,
        claimer: claim.bridger,
        timestampClaimed: claim.timestamp,
        timestampVerification: latestVerificationStart(claim.verification),
        blocknumberVerification: 0, // This would require additional data to fill accurately
        honest: 0, // Placeholder, as this data isn't available in the current query
        challenger: claim.challenge?.[0]?.challenger || ethers.ZeroAddress,
      });
    }
    return claimsByEpoch;
  } catch (e) {
    console.log(e);
    throw new Error(`Claims not found for epochs: ${epochs.join(", ")}`);
  }
};

// Rows per page of a paged indexer query.
const INDEXER_PAGE_SIZE = 1000;

/**
 * Every epoch below `belowEpoch` with a claim on the outbox, oldest first and each once (used by
 * the watcher's cold start to find claims older than the epochs it seeds). Paged by epoch,
 * `INDEXER_PAGE_SIZE` rows at a time, each page starting after the last epoch of the one before.
 * Throws on an indexer error: a partial list would leave older claims unwatched.
 * @param outbox
 * @param belowEpoch
 * @param chainId
 * @returns the claimed epochs
 */
const getClaimedEpochsBelow = async (outbox: string, belowEpoch: number, chainId: number): Promise<number[]> => {
  const subgraph = process.env.ENVIO_URL!;
  const epochs: number[] = [];
  let page: { epoch: number | string }[];
  do {
    const after = epochs.length > 0 ? epochs[epochs.length - 1] : -1;
    const result: { Claim: { epoch: number | string }[] } = await indexerRequest(
      subgraph,
      `{
        Claim(limit: ${INDEXER_PAGE_SIZE}, order_by: {epoch: asc}, where: {epoch: {_gt: ${after}, _lt: ${belowEpoch}}, outbox: {id: {_eq: "${outbox}"}}}) {
          epoch
        }
      }`
    );
    page = result.Claim;
    for (const claim of page) {
      const epoch = Number(claim.epoch);
      if (!Number.isSafeInteger(epoch)) throw new Error(`Indexer returned an invalid claim epoch: ${claim.epoch}`);
      if (epoch !== epochs[epochs.length - 1]) epochs.push(epoch);
    }
    // A full page that does not move past the one before would be fetched again forever.
    if (page.length === INDEXER_PAGE_SIZE && !(epochs[epochs.length - 1] > after)) {
      throw new Error(`Indexer claims did not page past epoch ${after}`);
    }
  } while (page.length === INDEXER_PAGE_SIZE);
  return epochs;
};

/**
 * The last block of chain `chainId` the indexer has processed (envio's `chain_metadata`), or
 * undefined when it reports none. Throws on an indexer error.
 * @param chainId
 * @returns the block number
 */
const getIndexedBlock = async (chainId: number): Promise<number | undefined> => {
  const subgraph = process.env.ENVIO_URL!;
  const result: { chain_metadata: { latest_processed_block: number | string | null }[] } = await indexerRequest(
    subgraph,
    `{
      chain_metadata(where: {chain_id: {_eq: ${chainId}}}) {
        latest_processed_block
      }
    }`
  );
  const processed = result.chain_metadata[0]?.latest_processed_block;
  const block = processed == null ? NaN : Number(processed);
  return Number.isSafeInteger(block) && block >= 0 ? block : undefined;
};

/**
 * Fetches the last claimed epoch (used for claimer - happy path)
 * @returns ClaimData
 */
const getLastClaimedEpoch = async (outbox: string, chainId: number): Promise<ClaimData> => {
  const subgraph = process.env.ENVIO_URL!;
  try {
    const result = await indexerRequest(
      `${subgraph}`,
      `{
          Claim(limit:1, order_by:{timestamp:desc}, where: {outbox: {id: {_eq: "${outbox}"}}}) {
                        id
                        bridger
                        stateRoot
                        timestamp
                        challenged
                        txHash
                        }

        }`
    );
    return result[`Claim`][0];
  } catch (e) {
    console.log(e);
    throw new ClaimNotFoundError(-1);
  }
};

type VerificationData = {
  startTimestamp: number | null;
  startTxHash: string | null;
};

/**
 * Fetches the verification data for a given claim (used for claimer - happy path)
 * @param claimId
 * @returns VerificationData
 */
const getVerificationForClaim = async (claimId: string, chainId: number): Promise<VerificationData | undefined> => {
  try {
    const subgraph = process.env.ENVIO_URL!;
    const result = await indexerRequest(
      `${subgraph}`,
      `{
          Verification(where: {claim: {id: {_eq: "${claimId}"}}}) {
            startTimestamp
            startTxHash
          }
        }`
    );
    return result[`Verification`][0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

/**
 * Fetches the challenger data for a given claim (used for validator - unhappy path)
 * @param claimId
 * @returns challenger address
 * */
const getChallengerForClaim = async (claimId: string, chainId: number): Promise<{ challenger: string } | undefined> => {
  try {
    const subgraph = process.env.ENVIO_URL!;
    const result = await indexerRequest(
      `${subgraph}`,
      `{
          Challenge(where: {claim: {id: {_eq: "${claimId}"}}}) {
            challenger
          }
        }`
    );
    return result[`Challenge`][0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

type SenSnapshotResponse = {
  Snapshot: {
    fallback: { txHash: string }[];
  }[];
};

/**
 * Fetches the snapshot data for a given epoch (used for validator - happy path)
 * @param epoch
 * @returns snapshot data
 */
const getSnapshotSentForEpoch = async (
  epoch: number,
  veaInbox: string,
  chainId: number
): Promise<{ txHash: string } | undefined> => {
  try {
    const subgraph = process.env.ENVIO_URL!;

    const result: SenSnapshotResponse = await indexerRequest(
      `${subgraph}`,
      `{
          Snapshot(where: {epoch: {_eq: ${epoch}}, inbox: { id: { _eq: "${veaInbox}" } }}) {
            fallback(order_by: {timestamp: desc}){
              txHash
            }
          }
        }`
    );
    return result.Snapshot[0].fallback[0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

type LastSnapshotSavedResponse = {
  SnapshotSaved: {
    count: string | number;
    stateRoot: string;
  }[];
};

/**
 * Fetches the last snapshot saved on a given inbox (used for validator - happy path): its root and
 * its `count`, the inbox count it saved, comparable to `veaInbox.count()`. Saves only ever cover
 * more messages, so the highest count is the latest save (equal counts save the same root).
 * @param veaInbox
 * @returns the last save, or null when the inbox has none
 */
const getLastSnapshotSaved = async (
  veaInbox: string,
  chainId: number
): Promise<{ count: number; stateRoot: string } | null> => {
  const subgraph = process.env.ENVIO_URL!;
  try {
    const result: LastSnapshotSavedResponse = await indexerRequest(
      `${subgraph}`,
      `{
      SnapshotSaved(limit:1, order_by:[{count:desc}, {blockNumber:desc}], where:{inbox:{id:{_eq:"${veaInbox}"}}}) {
        count
        stateRoot
      }
    }`
    );
    if (result.SnapshotSaved.length < 1) return null;
    const count = Number(result.SnapshotSaved[0].count);
    if (!Number.isSafeInteger(count)) throw new Error(`Indexer returned an invalid snapshot count: ${count}`);
    return { count, stateRoot: result.SnapshotSaved[0].stateRoot };
  } catch (e) {
    console.log(e);
    throw new NoMessageSavedError(veaInbox);
  }
};

export {
  getClaimForEpoch,
  getLastClaimedEpoch,
  getVerificationForClaim,
  getChallengerForClaim,
  getSnapshotSentForEpoch,
  getLastSnapshotSaved,
  ClaimData,
  getClaimsForEpochs,
  getClaimedEpochsBelow,
  getIndexedBlock,
  INDEXER_TIMEOUT_MS,
};
