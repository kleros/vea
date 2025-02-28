import useSWR from "swr";
import { bridges } from "consts/bridges";
import { getMessagesQuery } from "queries/getMessages";
import { getRelayQuery } from "queries/getRelay";
import { request } from "../../../node_modules/graphql-request/build/cjs/index";

export const useMessages = (
  snapshot: string,
  bridgeId: number,
  skip: number,
  getRelays: boolean
) => {
  return useSWR(`${snapshot}-${bridgeId}-${skip}-${getRelays}`, async () => {
    const { inboxEndpoint, outboxEndpoint } = bridges[bridgeId];
    const [messages, totalMessages] = await request(
      inboxEndpoint,
      getMessagesQuery,
      {
        skip,
        snapshot,
        snapshotID: snapshot,
      }
    ).then((result) => [result.messages, result.snapshot?.numberMessages]);
    return {
      messages: await Promise.all(
        messages.map(async (message: (typeof messages)[number]) => {
          return [
            message,
            getRelays
              ? await request(outboxEndpoint, getRelayQuery, {
                  id: message.id,
                }).then((result) => result.message)
              : null,
          ];
        })
      ),
      totalMessages,
    };
  });
};
