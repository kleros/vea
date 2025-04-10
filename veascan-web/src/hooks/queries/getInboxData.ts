import { graphql } from "src/gql";

export const getSnapshotQuery = graphql(`
  query getSnapshot($epoch: BigInt!, $inboxAddress: String!) {
    snapshots(where: { epoch: $epoch, inbox: $inboxAddress }) {
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
  query getSnapshots(
    $snapshotsPerPage: Int
    $lastTimestamp: BigInt!
    $inboxAddress: String!
  ) {
    snapshots(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $lastTimestamp, inbox: $inboxAddress }
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
    $resolving: Boolean = true
    $inboxAddress: String!
  ) {
    snapshots(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: $lastTimestamp
        resolving: $resolving
        inbox: $inboxAddress
      }
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
  query searchSnapshots(
    $snapshotsPerPage: Int
    $value: String!
    $inboxAddress: String!
  ) {
    snapshotQuery(
      text: $value
      first: $snapshotsPerPage
      where: { inboxAddress: $inboxAddress }
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
  }
`);
