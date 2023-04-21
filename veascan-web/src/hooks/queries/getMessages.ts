import { graphql } from "src/gql";

export const getMessagesQuery = graphql(`
  query getMessages($skip: Int!, $snapshot: String!) {
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
  }
`);
