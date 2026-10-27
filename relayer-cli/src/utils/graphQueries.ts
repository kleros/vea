import request from "graphql-request";
import { VeaOutboxArbToEth, VeaOutboxArbToGnosis } from "../../../contracts/typechain-types";
import { DataError } from "./errors";

interface SnapshotResponse {
  SnapshotSaved: Array<{ count: string }>;
}
/**
 * Get the count of the veaOutbox
 * @param veaOutbox The veaOutbox contract instance
 * @param chainId The chain id of the veaOutbox chain
 * @returns The count of the veaOutbox
 */
const getCount = async (
  veaOutbox: VeaOutboxArbToEth | VeaOutboxArbToGnosis,
  chainId: number,
  network: string
): Promise<number> => {
  const subgraph = process.env.ENVIO_URL!;
  const stateRoot = await veaOutbox.stateRoot();
  try {
    const result = (await request(
      subgraph,
      `{
      SnapshotSaved(limit: 1, where: { stateRoot: { _eq: "${stateRoot}" } }) {
        count
      }
    }`
    )) as SnapshotResponse;

    if (result["SnapshotSaved"].length == 0) return 0;

    return Number(result["SnapshotSaved"][0].count);
  } catch (e) {
    throw new DataError("Failed to fetch count(subgraph)", chainId, network, { cause: e });
  }
};

interface MessageSent {
  nonce: number;
}

interface MessageSentsResponse {
  MessageSent: MessageSent[];
}

// Page size of the MessageSent query. The server may cap a page below it, so only an empty page ends the read
const NONCE_PAGE_SIZE = 1000;

/**
 * Get the nonces of messages sent by a given sender, page by page until an empty page.
 * Already-relayed rows at or above `nonce` are included, so a long history needs several pages.
 * @param chainId The chain id of the veaOutbox chain
 * @param inbox The address of the veaInbox
 * @param nonce The nonce of the first message to relay
 * @param msgSender The address of the sender
 * @param network The network name, for error reporting
 * @returns All the nonces at or above `nonce` of the messages sent by the sender, in ascending order
 */
const getNonceFrom = async (
  chainId: number,
  inbox: string,
  nonce: number,
  msgSender: string,
  network: string
): Promise<number[]> => {
  const subgraph = process.env.ENVIO_URL!;
  const nonces: number[] = [];
  try {
    for (;;) {
      const result = (await request(
        subgraph,
        `{
        MessageSent(
          limit: ${NONCE_PAGE_SIZE},
          offset: ${nonces.length},
          where: {
            inbox: { id: { _eq: "${inbox}" } },
            nonce: { _gte: ${nonce} },
            msgSender: { id: { _eq: "${msgSender.toLowerCase()}" } }
          },
          order_by: { nonce: asc }
        ) {
          nonce
        }
      }`
      )) as MessageSentsResponse;

      const page = result[`MessageSent`];
      if (page.length === 0) return nonces;
      nonces.push(...page.map((a: { nonce: string | number }) => Number(a.nonce)));
    }
  } catch (e) {
    throw new DataError("Failed to fetch nonce(subgraph)", chainId, network, { cause: e });
  }
};

export { getCount, getNonceFrom };
