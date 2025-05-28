import { graphql } from "src/gql";

export const getClaimQuery = graphql(`
  query getClaim($epoch: BigInt!, $contract: String!) {
    claims(where: { epoch: $epoch, outbox: $contract }) {
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
        verifiedTimestamp
        verifiedCaller
        verifiedTxHash
      }
    }
  }
`);

export const getClaimedSnapshotsQuery = graphql(`
  query getClaimedSnapshots(
    $snapshotsPerPage: Int
    $lastTimestamp: BigInt!
    $contract: String!
  ) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: $lastTimestamp
        verified: false
        challenged: false
        outbox: $contract
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
        verifiedTimestamp
        verifiedCaller
        verifiedTxHash
      }
    }
  }
`);

export const getChallengedSnapshotsQuery = graphql(`
  query getChallengedSnapshots(
    $snapshotsPerPage: Int
    $lastTimestamp: BigInt!
    $contract: String!
  ) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: $lastTimestamp
        verified: false
        challenged: true
        outbox: $contract
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
        verifiedTimestamp
        verifiedCaller
        verifiedTxHash
      }
    }
  }
`);

export const getVerifiedSnapshotsQuery = graphql(`
  query getVerifiedSnapshots(
    $snapshotsPerPage: Int
    $lastTimestamp: BigInt!
    $contract: String!
  ) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: $lastTimestamp
        verified: true
        challenged: false
        outbox: $contract
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
        verifiedTimestamp
        verifiedCaller
        verifiedTxHash
      }
    }
  }
`);

export const getResolvedSnapshotsQuery = graphql(`
  query getResolvedSnapshots(
    $snapshotsPerPage: Int
    $lastTimestamp: BigInt!
    $contract: String!
  ) {
    claims(
      first: $snapshotsPerPage
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: $lastTimestamp
        verified: true
        challenged: true
        outbox: $contract
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
        verifiedTimestamp
        verifiedCaller
        verifiedTxHash
      }
    }
  }
`);
