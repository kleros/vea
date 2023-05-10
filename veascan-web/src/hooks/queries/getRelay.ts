import { graphql } from "src/gql";

export const getRelayQuery = graphql(`
  query getRelay($id: ID!) {
    message(id: $id) {
      timestamp
      txHash
      relayer
      proof
    }
  }
`);
