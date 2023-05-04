import { graphql } from "src/gql";

export const getSnapshotsQuery = graphql(`
  query getSnapshots($lastTimestamp: BigInt!, $snapshotsPerPage: Int) {
    snapshots(
      first: $snapshotsPerPage
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
      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {
        executor
        timestamp
        txHash
        ticketId
      }
    }
    ref(id: "0") {
      currentSnapshotIndex
    }
  }
`);
