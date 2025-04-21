import { graphql } from "src/gql";

export const getSnapshotQuery = graphql(`
  query getSnapshot($epoch: BigInt!, $contract: String!) {
    snapshots(where: { epoch: $epoch, inbox: $contract }) {
      id
      epoch
      caller
      txHash
      timestamp
      stateRoot
      numberMessages
      saved
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
    $contract: String!
  ) {
    snapshots(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $lastTimestamp, inbox: $contract }
    ) {
      id
      epoch
      caller
      txHash
      timestamp
      stateRoot
      numberMessages
      saved
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
    $contract: String!
  ) {
    snapshots(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: $lastTimestamp
        resolving: $resolving
        inbox: $contract
      }
    ) {
      id
      epoch
      caller
      txHash
      timestamp
      stateRoot
      numberMessages
      saved
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
    $contract: String!
  ) {
    snapshotQuery(
      text: $value
      first: $snapshotsPerPage
      where: { inbox: $contract }
    ) {
      id
      epoch
      caller
      txHash
      timestamp
      stateRoot
      numberMessages
      saved
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
