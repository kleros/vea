import { graphql } from "src/gql";

export const getSnapshotsQuery = graphql`
  query getSnapshots {
    snapshots(first: 5, orderBy: timestamp) {
      id
      epoch
      txHash
      timestamp
      stateRoot
      numberMessages
      taken
      resolving
    }
  }
`;
