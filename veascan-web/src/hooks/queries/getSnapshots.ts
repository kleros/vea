import { graphql } from "src/gql";

export const getSnapshotsQuery = graphql(`
  query getSnapshots($lastTimestamp: BigInt!) {
    snapshots(
      first: 5
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $lastTimestamp }
    ) {
      id
      epoch
      caller
      txHash
      timestamp
      stateRoot
      numberMessages
      taken
      resolving
    }
  }
`);
