import { graphql } from "src/gql";

export const getMessagesQuery = graphql(`
  query getMessages($skip: Int!, $snapshot: String!, $snapshotID: ID!) {
    messages(
      first: 5
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
      where: { snapshot: $snapshot }
    ) {
      id
      txHash
      timestamp
      from
      to
      data
    }
    snapshot(id: $snapshotID) {
      numberMessages
    }
  }
`);
