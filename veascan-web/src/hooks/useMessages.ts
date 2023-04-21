import useSWR from "swr";
import { request } from "../../../node_modules/graphql-request/build/cjs/index";
import { bridges } from "consts/bridges";
import { getMessagesQuery } from "./queries/getMessages";
import { getRelayQuery } from "./queries/getRelay";

export const useMessages = (
  snapshot: string,
  bridgeIndex: number,
  skip: number,
  getRelays: boolean
) => {
  return useSWR(`${snapshot}-${bridgeIndex}-${skip}-${getRelays}`, async () => {
    const { inboxEndpoint, outboxEndpoint } = bridges[bridgeIndex];
    const messages = await request(inboxEndpoint, getMessagesQuery, {
      skip,
      snapshot,
    }).then((result) => result.messages);
    if (!getRelays) return messages.map((message) => [message, null]);
    else
      return Promise.all(
        messages.map(async (message) => {
          const relayData = await request(outboxEndpoint, getRelayQuery, {
            id: message.id,
          }).then((result) => result.message);
          return [message, relayData];
        })
      );
  });
};
