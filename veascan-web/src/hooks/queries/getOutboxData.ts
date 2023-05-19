import { graphql } from "src/gql";

export const getClaimQuery = graphql(`
  query getClaim($epoch: BigInt!) {
    claims(where: { epoch: $epoch }) {
      id
      epoch
      timestamp
      stateroot
      bridger
      challenged
      txHash
      challenge {
        id
        timestamp
        challenger
        honest
        txHash
      }
      verification {
        timestamp
        caller
        txHash
      }
      honest
    }
  }
`);

export const getClaimedSnapshotsQuery = graphql(`
  query getClaimedSnapshots($snapshotsPerPage: Int, $lastTimestamp: BigInt!) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $lastTimestamp, honest: false, challenged: false }
    ) {
      id
      epoch
      timestamp
      stateroot
      bridger
      challenged
      txHash
      challenge {
        id
        timestamp
        challenger
        honest
        txHash
      }
      verification {
        timestamp
        caller
        txHash
      }
      honest
    }
  }
`);

export const getChallengedSnapshotsQuery = graphql(`
  query getChallengedSnapshots(
    $snapshotsPerPage: Int
    $lastTimestamp: BigInt!
  ) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $lastTimestamp, honest: false, challenged: true }
    ) {
      id
      epoch
      timestamp
      stateroot
      bridger
      challenged
      txHash
      challenge {
        id
        timestamp
        challenger
        honest
        txHash
      }
      verification {
        timestamp
        caller
        txHash
      }
      honest
    }
  }
`);

export const getVerifiedSnapshotsQuery = graphql(`
  query getVerifiedSnapshots($snapshotsPerPage: Int, $lastTimestamp: BigInt!) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $lastTimestamp, honest: true, challenged: false }
    ) {
      id
      epoch
      timestamp
      stateroot
      bridger
      challenged
      txHash
      challenge {
        id
        timestamp
        challenger
        honest
        txHash
      }
      verification {
        timestamp
        caller
        txHash
      }
      honest
    }
  }
`);

export const getResolvedSnapshotsQuery = graphql(`
  query getResolvedSnapshots($snapshotsPerPage: Int, $lastTimestamp: BigInt!) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $lastTimestamp, honest: true, challenged: true }
    ) {
      id
      epoch
      timestamp
      stateroot
      bridger
      challenged
      txHash
      challenge {
        id
        timestamp
        challenger
        honest
        txHash
      }
      verification {
        timestamp
        caller
        txHash
      }
      honest
    }
  }
`);
