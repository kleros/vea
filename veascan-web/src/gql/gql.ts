/* eslint-disable */
import * as types from "./graphql";
import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 */
const documents = {
  "\n  query getSnapshot($epoch: BigInt!, $contract: String!) {\n    snapshots(where: { epoch: $epoch, inbox: $contract }) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n  }\n":
    types.GetSnapshotDocument,
  '\n  query getSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    snapshots(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: { timestamp_lte: $lastTimestamp, inbox: $contract }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n    ref(id: "0") {\n      currentSnapshotIndex\n    }\n  }\n':
    types.GetSnapshotsDocument,
  '\n  query getResolvingSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $resolving: Boolean = true\n    $contract: String!\n  ) {\n    snapshots(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        resolving: $resolving\n        inbox: $contract\n      }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n    ref(id: "0") {\n      currentSnapshotIndex\n    }\n  }\n':
    types.GetResolvingSnapshotsDocument,
  "\n  query searchSnapshots(\n    $snapshotsPerPage: Int\n    $value: String!\n    $contract: String!\n  ) {\n    snapshotQuery(\n      text: $value\n      first: $snapshotsPerPage\n      where: { inbox: $contract }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n  }\n":
    types.SearchSnapshotsDocument,
  "\n  query getMessages($skip: Int!, $snapshot: String!, $snapshotID: ID!) {\n    messages(\n      first: 5\n      skip: $skip\n      orderBy: timestamp\n      orderDirection: desc\n      where: { snapshot: $snapshot }\n    ) {\n      id\n      txHash\n      timestamp\n      from\n      to\n      data\n    }\n    snapshot(id: $snapshotID) {\n      numberMessages\n    }\n  }\n":
    types.GetMessagesDocument,
  "\n  query getClaim($epoch: BigInt!, $contract: String!) {\n    claims(where: { epoch: $epoch, outbox: $contract }) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n":
    types.GetClaimDocument,
  "\n  query getClaimedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: false\n        challenged: false\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n":
    types.GetClaimedSnapshotsDocument,
  "\n  query getChallengedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: false\n        challenged: true\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n":
    types.GetChallengedSnapshotsDocument,
  "\n  query getVerifiedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: true\n        challenged: false\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n":
    types.GetVerifiedSnapshotsDocument,
  "\n  query getResolvedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: true\n        challenged: true\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n":
    types.GetResolvedSnapshotsDocument,
  "\n  query getRelay($id: ID!) {\n    message(id: $id) {\n      timestamp\n      txHash\n      relayer\n      proof\n    }\n  }\n":
    types.GetRelayDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query getSnapshot($epoch: BigInt!, $contract: String!) {\n    snapshots(where: { epoch: $epoch, inbox: $contract }) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n  }\n"
): (typeof documents)["\n  query getSnapshot($epoch: BigInt!, $contract: String!) {\n    snapshots(where: { epoch: $epoch, inbox: $contract }) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query getSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    snapshots(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: { timestamp_lte: $lastTimestamp, inbox: $contract }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n    ref(id: "0") {\n      currentSnapshotIndex\n    }\n  }\n'
): (typeof documents)['\n  query getSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    snapshots(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: { timestamp_lte: $lastTimestamp, inbox: $contract }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n    ref(id: "0") {\n      currentSnapshotIndex\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query getResolvingSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $resolving: Boolean = true\n    $contract: String!\n  ) {\n    snapshots(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        resolving: $resolving\n        inbox: $contract\n      }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n    ref(id: "0") {\n      currentSnapshotIndex\n    }\n  }\n'
): (typeof documents)['\n  query getResolvingSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $resolving: Boolean = true\n    $contract: String!\n  ) {\n    snapshots(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        resolving: $resolving\n        inbox: $contract\n      }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n    ref(id: "0") {\n      currentSnapshotIndex\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query searchSnapshots(\n    $snapshotsPerPage: Int\n    $value: String!\n    $contract: String!\n  ) {\n    snapshotQuery(\n      text: $value\n      first: $snapshotsPerPage\n      where: { inbox: $contract }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n  }\n"
): (typeof documents)["\n  query searchSnapshots(\n    $snapshotsPerPage: Int\n    $value: String!\n    $contract: String!\n  ) {\n    snapshotQuery(\n      text: $value\n      first: $snapshotsPerPage\n      where: { inbox: $contract }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query getMessages($skip: Int!, $snapshot: String!, $snapshotID: ID!) {\n    messages(\n      first: 5\n      skip: $skip\n      orderBy: timestamp\n      orderDirection: desc\n      where: { snapshot: $snapshot }\n    ) {\n      id\n      txHash\n      timestamp\n      from\n      to\n      data\n    }\n    snapshot(id: $snapshotID) {\n      numberMessages\n    }\n  }\n"
): (typeof documents)["\n  query getMessages($skip: Int!, $snapshot: String!, $snapshotID: ID!) {\n    messages(\n      first: 5\n      skip: $skip\n      orderBy: timestamp\n      orderDirection: desc\n      where: { snapshot: $snapshot }\n    ) {\n      id\n      txHash\n      timestamp\n      from\n      to\n      data\n    }\n    snapshot(id: $snapshotID) {\n      numberMessages\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query getClaim($epoch: BigInt!, $contract: String!) {\n    claims(where: { epoch: $epoch, outbox: $contract }) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"
): (typeof documents)["\n  query getClaim($epoch: BigInt!, $contract: String!) {\n    claims(where: { epoch: $epoch, outbox: $contract }) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query getClaimedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: false\n        challenged: false\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"
): (typeof documents)["\n  query getClaimedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: false\n        challenged: false\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query getChallengedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: false\n        challenged: true\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"
): (typeof documents)["\n  query getChallengedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: false\n        challenged: true\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query getVerifiedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: true\n        challenged: false\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"
): (typeof documents)["\n  query getVerifiedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: true\n        challenged: false\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query getResolvedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: true\n        challenged: true\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"
): (typeof documents)["\n  query getResolvedSnapshots(\n    $snapshotsPerPage: Int\n    $lastTimestamp: BigInt!\n    $contract: String!\n  ) {\n    claims(\n      first: $snapshotsPerPage\n      orderBy: timestamp\n      orderDirection: desc\n      where: {\n        timestamp_lte: $lastTimestamp\n        verified: true\n        challenged: true\n        outbox: $contract\n      }\n    ) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      verified\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query getRelay($id: ID!) {\n    message(id: $id) {\n      timestamp\n      txHash\n      relayer\n      proof\n    }\n  }\n"
): (typeof documents)["\n  query getRelay($id: ID!) {\n    message(id: $id) {\n      timestamp\n      txHash\n      relayer\n      proof\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
