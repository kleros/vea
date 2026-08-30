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

/**
 * Get the nonces of messages sent by a given sender
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the first message to relay
 * @param msgSender The address of the sender
 * @returns The nonces of the messages sent by the sender
 */
const getNonceFrom = async (chainId: number, inbox: string, nonce: number, msgSender: string, network: string) => {
  const subgraph = process.env.ENVIO_URL!;
  try {
    const result = (await request(
      subgraph,
      `{
        MessageSent(
          limit: 1000,
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

    return result[`MessageSent`].map((a: { nonce: string | number }) => Number(a.nonce));
  } catch (e) {
    throw new DataError("Failed to fetch nonce(subgraph)", chainId, network, { cause: e });
  }
};

export { getCount, getNonceFrom };
