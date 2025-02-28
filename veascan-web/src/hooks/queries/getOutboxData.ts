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
      verified
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
    }
  }
`);

export const getClaimedSnapshotsQuery = graphql(`
  query getClaimedSnapshots($snapshotsPerPage: Int, $lastTimestamp: BigInt!) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: $lastTimestamp
        verified: false
        challenged: false
      }
    ) {
      id
      epoch
      timestamp
      stateroot
      bridger
      challenged
      verified
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
      where: {
        timestamp_lte: $lastTimestamp
        verified: false
        challenged: true
      }
    ) {
      id
      epoch
      timestamp
      stateroot
      bridger
      challenged
      verified
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
    }
  }
`);

export const getVerifiedSnapshotsQuery = graphql(`
  query getVerifiedSnapshots($snapshotsPerPage: Int, $lastTimestamp: BigInt!) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: $lastTimestamp
        verified: true
        challenged: false
      }
    ) {
      id
      epoch
      timestamp
      stateroot
      bridger
      challenged
      verified
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
    }
  }
`);

export const getResolvedSnapshotsQuery = graphql(`
  query getResolvedSnapshots($snapshotsPerPage: Int, $lastTimestamp: BigInt!) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $lastTimestamp, verified: true, challenged: true }
    ) {
      id
      epoch
      timestamp
      stateroot
      bridger
      challenged
      verified
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
    }
  }
`);
