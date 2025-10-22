import request from "graphql-request";
import { VeaOutboxArbToEth, VeaOutboxArbToGnosis } from "@kleros/vea-contracts/typechain-types";

async function getVeaMsgTrnx(nonce: number, inboxAddress: string) {
  console.log(`Fetching transaction hashes for nonce ${nonce} from inbox ${inboxAddress}`);
  try {
    const subgraph = process.env.RELAYER_SUBGRAPH;
    const query = `{messageSents(first: 1, where: {nonce: ${nonce}, inbox: "${inboxAddress}"}) {
    id
    transactionHash
  }}`;
    const result = (await request(`https://api.studio.thegraph.com/query/${subgraph}`, query)) as {
      messageSents: { id: string; transactionHash: string }[];
    };
    return result.messageSents.map((trnx) => trnx.transactionHash);
  } catch (e) {
    console.log(e);
    return [];
  }
}

interface SnapshotResponse {
  snapshotSaveds: Array<{ count: string }>;
}
/**
 * Get the count of the veaOutbox
 * @param veaOutbox The veaOutbox contract instance
 * @param chainId The chain id of the veaOutbox chain
 * @returns The count of the veaOutbox
 */
const getCount = async (veaOutbox: VeaOutboxArbToEth | VeaOutboxArbToGnosis, chainId: number): Promise<number> => {
  const subgraph = process.env.RELAYER_SUBGRAPH;
  const stateRoot = await veaOutbox.stateRoot();

  const result = (await request(
    `https://api.studio.thegraph.com/query/${subgraph}`,
    `{
      snapshotSaveds(first: 1, where: { stateRoot: "${stateRoot}" }) {
        count
      }
    }`
  )) as SnapshotResponse;

  if (result["snapshotSaveds"].length == 0) return 0;

  return Number(result["snapshotSaveds"][0].count);
};

interface MessageSent {
  nonce: number;
}

interface MessageSentsResponse {
  messageSents: MessageSent[];
}

/**
 * Get the nonces of messages sent by a given sender
 * @param chainId The chain id of the veaOutbox chain
 * @param nonce The nonce of the first message to relay
 * @param msgSender The address of the sender
 * @returns The nonces of the messages sent by the sender
 */
const getNonceFrom = async (chainId: number, inbox: string, nonce: number, msgSender: string) => {
  const subgraph = process.env.RELAYER_SUBGRAPH;

  const result = (await request(
    `https://api.studio.thegraph.com/query/${subgraph}`,
    `{
        messageSents(
          first: 1000, 
          where: {
            inbox: "${inbox}",
            nonce_gte: ${nonce}, 
            msgSender_: {id: "${msgSender}"}
          }, 
          orderBy: nonce, 
          orderDirection: asc
        ) {
          nonce
        }
      }`
  )) as MessageSentsResponse;

  return result[`messageSents`].map((a: { nonce: number }) => a.nonce);
};

export { getVeaMsgTrnx, getCount, getNonceFrom };
