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
