import { graphql } from "src/gql";

export const getSnapshotQuery = graphql(`
  query getSnapshot($epoch: BigInt!) {
    snapshots(where: { epoch: $epoch }) {
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
  }
`);

export const getSnapshotsQuery = graphql(`
  query getSnapshots($snapshotsPerPage: Int, $lastTimestamp: BigInt!) {
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

export const getResolvingSnapshotsQuery = graphql(`
  query getResolvingSnapshots(
    $snapshotsPerPage: Int
    $lastTimestamp: BigInt!
    $resolving: Boolean
  ) {
    snapshots(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $lastTimestamp, resolving: $resolving }
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

export const searchSnapshotsQuery = graphql(`
  query searchSnapshots($snapshotsPerPage: Int, $value: String!) {
    snapshotQuery(text: $value, first: $snapshotsPerPage) {
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
  }
`);
