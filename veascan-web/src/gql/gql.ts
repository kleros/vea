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
  "\n  query getClaim($epoch: BigInt!) {\n    claims(where: { epoch: $epoch }) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n      honest\n    }\n  }\n":
    types.GetClaimDocument,
  "\n  query getMessages($skip: Int!, $snapshot: String!, $snapshotID: ID!) {\n    messages(\n      first: 5\n      skip: $skip\n      orderBy: timestamp\n      orderDirection: desc\n      where: { snapshot: $snapshot }\n    ) {\n      id\n      txHash\n      timestamp\n      from\n      to\n      data\n    }\n    snapshot(id: $snapshotID) {\n      numberMessages\n    }\n  }\n":
    types.GetMessagesDocument,
  "\n  query getRelay($id: ID!) {\n    message(id: $id) {\n      timestamp\n      txHash\n      relayer\n      proof\n    }\n  }\n":
    types.GetRelayDocument,
  "\n  query getSnapshots($lastTimestamp: BigInt!) {\n    snapshots(\n      first: 5\n      orderBy: timestamp\n      orderDirection: asc\n      where: { timestamp_lte: $lastTimestamp }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n  }\n":
    types.GetSnapshotsDocument,
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
  source: "\n  query getClaim($epoch: BigInt!) {\n    claims(where: { epoch: $epoch }) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n      honest\n    }\n  }\n"
): (typeof documents)["\n  query getClaim($epoch: BigInt!) {\n    claims(where: { epoch: $epoch }) {\n      id\n      epoch\n      timestamp\n      stateroot\n      bridger\n      challenged\n      txHash\n      challenge {\n        id\n        timestamp\n        challenger\n        honest\n        txHash\n      }\n      verification {\n        timestamp\n        caller\n        txHash\n      }\n      honest\n    }\n  }\n"];
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
  source: "\n  query getRelay($id: ID!) {\n    message(id: $id) {\n      timestamp\n      txHash\n      relayer\n      proof\n    }\n  }\n"
): (typeof documents)["\n  query getRelay($id: ID!) {\n    message(id: $id) {\n      timestamp\n      txHash\n      relayer\n      proof\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query getSnapshots($lastTimestamp: BigInt!) {\n    snapshots(\n      first: 5\n      orderBy: timestamp\n      orderDirection: asc\n      where: { timestamp_lte: $lastTimestamp }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n  }\n"
): (typeof documents)["\n  query getSnapshots($lastTimestamp: BigInt!) {\n    snapshots(\n      first: 5\n      orderBy: timestamp\n      orderDirection: asc\n      where: { timestamp_lte: $lastTimestamp }\n    ) {\n      id\n      epoch\n      caller\n      txHash\n      timestamp\n      stateRoot\n      numberMessages\n      taken\n      resolving\n      fallback(first: 1, orderBy: timestamp, orderDirection: desc) {\n        executor\n        timestamp\n        txHash\n        ticketId\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
