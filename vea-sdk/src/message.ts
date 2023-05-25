import request from "graphql-request";
import { ContractTransaction } from "@ethersproject/contracts";
import { Signer } from "@ethersproject/abstract-signer";
import { VeaClient } from "./client";

export type MessageInfo = {
  messageId: number;
  proof: string[];
  to: `0x${string}`;
  data: string;
};

export const relay = async (
  client: VeaClient,
  messageInfo: MessageInfo,
  signer: Signer
): Promise<ContractTransaction> => {
  return client.outbox
    .connect(signer)
    .sendMessage(messageInfo.proof, messageInfo.messageId, messageInfo.to, messageInfo.data);
};

export const getMessageInfo = async (client: VeaClient, messageId: number): Promise<MessageInfo> => {
  const count = await getCount(client);
  const proof = await getProofAtCount(client, messageId, count);
  const [to, data] = (await getMessageDataToRelay(client, messageId)) as [`0x${string}`, string];
  return {
    messageId,
    proof,
    to,
    data,
  };
};

const getCount = async (client: VeaClient): Promise<number> => {
  const subgraph = client.config.bridge.outboxSubgraph;
  const stateRoot = await client.outbox.stateRoot();
  const query = `{
    snapshotSaveds(first: 1, where: { stateRoot: "${stateRoot}" }) {
      count
    }
  }`;
  const result: any = await request(subgraph, query);
  if (result["snapshotSaveds"].length == 0) throw new Error("No snapshot found");
  return Number(result["snapshotSaveds"][0].count);
};

const getProofAtCount = async (client: VeaClient, messageId: number, count: number): Promise<string[]> => {
  const proofIndices = getProofIndices(messageId, count);

  let query = "{";
  for (let i = 0; i < proofIndices.length; i++) {
    query += `layer${i}: nodes(first: 1, where: {id: "${proofIndices[i]}"}) {
              hash
            }`;
  }
  query += "}";

  const proof: any[] = [];
  try {
    const subgraph = client.config.bridge.outboxSubgraph;
    const result: any = await request(subgraph, query);
    for (let i = 0; i < proofIndices.length; i++) {
      proof.push(result[`layer${i}`][0].hash);
    }
  } catch (e) {
    console.log(e);
  }
  return proof;
};

const getProofIndices = (messageId: number, count: number) => {
  let proof: any[] = [];
  if (messageId >= count) {
    return proof;
  }
  const treeDepth = Math.ceil(Math.log2(count));
  for (let i = 0; i < treeDepth; i++) {
    if (i == 0 && (messageId ^ 1) < count) proof.push((messageId ^ 1).toString()); // sibling
    else {
      const low = ((messageId >> i) ^ 1) << i;
      const high = Math.min(low + Math.pow(2, i) - 1, count - 1);
      if (low < count - 1) proof.push(low.toString() + "," + high.toString());
      else if (low == count - 1) proof.push(low.toString());
    }
  }
  return proof;
};

const getMessageDataToRelay = async (client: VeaClient, messageId: number): Promise<[string, string]> => {
  let dataAndTo: [string, string] = ["", ""];
  try {
    const subgraph = client.config.bridge.outboxSubgraph;
    const query = `{
        messageSents(first: 5, where: {messageId: ${messageId}}) {
        messageId
        to {
            id
        }
        data
        }
    }`;
    const result: any = await request(subgraph, query);
    dataAndTo = [result[`messageSents`][0].to.id, result[`messageSents`][0].data];
  } catch (e) {
    console.log(e);
  }
  return dataAndTo;
};
