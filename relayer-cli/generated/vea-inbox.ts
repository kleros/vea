import { GraphQLClient } from "graphql-request";
import { GraphQLClientRequestHeaders } from "graphql-request/build/cjs/types";
import gql from "graphql-tag";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  BigDecimal: { input: any; output: any };
  BigInt: { input: any; output: any };
  Bytes: { input: any; output: any };
  Int8: { input: any; output: any };
};

export type BlockChangedFilter = {
  number_gte: Scalars["Int"]["input"];
};

export type Block_Height = {
  hash?: InputMaybe<Scalars["Bytes"]["input"]>;
  number?: InputMaybe<Scalars["Int"]["input"]>;
  number_gte?: InputMaybe<Scalars["Int"]["input"]>;
};

export type MessageSent = {
  __typename?: "MessageSent";
  blockNumber: Scalars["BigInt"]["output"];
  blockTimestamp: Scalars["BigInt"]["output"];
  data: Scalars["Bytes"]["output"];
  epoch: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  msgSender: Sender;
  node: Node;
  nonce: Scalars["BigInt"]["output"];
  to: Receiver;
  transactionHash: Scalars["Bytes"]["output"];
};

export type MessageSent_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<MessageSent_Filter>>>;
  blockNumber?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockNumber_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockTimestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockTimestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  data?: InputMaybe<Scalars["Bytes"]["input"]>;
  data_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  data_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  data_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  data_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  data_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  data_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  data_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  data_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  data_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  epoch?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epoch_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  id_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  msgSender?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_?: InputMaybe<Sender_Filter>;
  msgSender_contains?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_gt?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_gte?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  msgSender_lt?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_lte?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_not?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  msgSender_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  msgSender_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  node?: InputMaybe<Scalars["String"]["input"]>;
  node_?: InputMaybe<Node_Filter>;
  node_contains?: InputMaybe<Scalars["String"]["input"]>;
  node_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  node_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  node_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  node_gt?: InputMaybe<Scalars["String"]["input"]>;
  node_gte?: InputMaybe<Scalars["String"]["input"]>;
  node_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  node_lt?: InputMaybe<Scalars["String"]["input"]>;
  node_lte?: InputMaybe<Scalars["String"]["input"]>;
  node_not?: InputMaybe<Scalars["String"]["input"]>;
  node_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  node_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  node_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  node_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  node_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  node_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  node_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  node_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  node_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  nonce?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  nonce_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<MessageSent_Filter>>>;
  to?: InputMaybe<Scalars["String"]["input"]>;
  to_?: InputMaybe<Receiver_Filter>;
  to_contains?: InputMaybe<Scalars["String"]["input"]>;
  to_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  to_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  to_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  to_gt?: InputMaybe<Scalars["String"]["input"]>;
  to_gte?: InputMaybe<Scalars["String"]["input"]>;
  to_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  to_lt?: InputMaybe<Scalars["String"]["input"]>;
  to_lte?: InputMaybe<Scalars["String"]["input"]>;
  to_not?: InputMaybe<Scalars["String"]["input"]>;
  to_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  to_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  to_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  to_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  to_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  to_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  to_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  to_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  to_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transactionHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
};

export enum MessageSent_OrderBy {
  BlockNumber = "blockNumber",
  BlockTimestamp = "blockTimestamp",
  Data = "data",
  Epoch = "epoch",
  Id = "id",
  MsgSender = "msgSender",
  MsgSenderId = "msgSender__id",
  Node = "node",
  NodeHash = "node__hash",
  NodeId = "node__id",
  Nonce = "nonce",
  To = "to",
  ToId = "to__id",
  TransactionHash = "transactionHash",
}

export type Node = {
  __typename?: "Node";
  hash: Scalars["Bytes"]["output"];
  id: Scalars["ID"]["output"];
};

export type Node_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Node_Filter>>>;
  hash?: InputMaybe<Scalars["Bytes"]["input"]>;
  hash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  hash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  hash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  hash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  hash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  hash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  hash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  hash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  hash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Node_Filter>>>;
};

export enum Node_OrderBy {
  Hash = "hash",
  Id = "id",
}

/** Defines the order direction, either ascending or descending */
export enum OrderDirection {
  Asc = "asc",
  Desc = "desc",
}

export type Query = {
  __typename?: "Query";
  /** Access to subgraph metadata */
  _meta?: Maybe<_Meta_>;
  messageSent?: Maybe<MessageSent>;
  messageSents: Array<MessageSent>;
  node?: Maybe<Node>;
  nodes: Array<Node>;
  receiver?: Maybe<Receiver>;
  receivers: Array<Receiver>;
  sender?: Maybe<Sender>;
  senders: Array<Sender>;
  snapshotSaved?: Maybe<SnapshotSaved>;
  snapshotSaveds: Array<SnapshotSaved>;
  snapshotSent?: Maybe<SnapshotSent>;
  snapshotSents: Array<SnapshotSent>;
};

export type Query_MetaArgs = {
  block?: InputMaybe<Block_Height>;
};

export type QueryMessageSentArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryMessageSentsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<MessageSent_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<MessageSent_Filter>;
};

export type QueryNodeArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryNodesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Node_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Node_Filter>;
};

export type QueryReceiverArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryReceiversArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Receiver_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Receiver_Filter>;
};

export type QuerySenderArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QuerySendersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Sender_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Sender_Filter>;
};

export type QuerySnapshotSavedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QuerySnapshotSavedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<SnapshotSaved_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SnapshotSaved_Filter>;
};

export type QuerySnapshotSentArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QuerySnapshotSentsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<SnapshotSent_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SnapshotSent_Filter>;
};

export type Receiver = {
  __typename?: "Receiver";
  id: Scalars["Bytes"]["output"];
  messages: Array<MessageSent>;
};

export type ReceiverMessagesArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<MessageSent_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<MessageSent_Filter>;
};

export type Receiver_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Receiver_Filter>>>;
  id?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  id_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  messages_?: InputMaybe<MessageSent_Filter>;
  or?: InputMaybe<Array<InputMaybe<Receiver_Filter>>>;
};

export enum Receiver_OrderBy {
  Id = "id",
  Messages = "messages",
}

export type Sender = {
  __typename?: "Sender";
  id: Scalars["Bytes"]["output"];
  messages: Array<MessageSent>;
};

export type SenderMessagesArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<MessageSent_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<MessageSent_Filter>;
};

export type Sender_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Sender_Filter>>>;
  id?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  id_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  messages_?: InputMaybe<MessageSent_Filter>;
  or?: InputMaybe<Array<InputMaybe<Sender_Filter>>>;
};

export enum Sender_OrderBy {
  Id = "id",
  Messages = "messages",
}

export type SnapshotSaved = {
  __typename?: "SnapshotSaved";
  blockNumber: Scalars["BigInt"]["output"];
  blockTimestamp: Scalars["BigInt"]["output"];
  count: Scalars["BigInt"]["output"];
  epoch: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  stateRoot: Scalars["Bytes"]["output"];
  transactionHash: Scalars["Bytes"]["output"];
};

export type SnapshotSaved_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SnapshotSaved_Filter>>>;
  blockNumber?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockNumber_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockTimestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockTimestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  count?: InputMaybe<Scalars["BigInt"]["input"]>;
  count_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  count_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  count_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  count_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  count_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  count_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  count_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epoch?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epoch_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  epoch_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  id_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<SnapshotSaved_Filter>>>;
  stateRoot?: InputMaybe<Scalars["Bytes"]["input"]>;
  stateRoot_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  stateRoot_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  stateRoot_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  stateRoot_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  stateRoot_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  stateRoot_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  stateRoot_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  stateRoot_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  stateRoot_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
};

export enum SnapshotSaved_OrderBy {
  BlockNumber = "blockNumber",
  BlockTimestamp = "blockTimestamp",
  Count = "count",
  Epoch = "epoch",
  Id = "id",
  StateRoot = "stateRoot",
  TransactionHash = "transactionHash",
}

export type SnapshotSent = {
  __typename?: "SnapshotSent";
  blockNumber: Scalars["BigInt"]["output"];
  blockTimestamp: Scalars["BigInt"]["output"];
  epochSent: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  ticketId: Scalars["Bytes"]["output"];
  transactionHash: Scalars["Bytes"]["output"];
};

export type SnapshotSent_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SnapshotSent_Filter>>>;
  blockNumber?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockNumber_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockTimestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockTimestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epochSent?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSent_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSent_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSent_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epochSent_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSent_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSent_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSent_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  id_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<SnapshotSent_Filter>>>;
  ticketId?: InputMaybe<Scalars["Bytes"]["input"]>;
  ticketId_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  ticketId_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  ticketId_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  ticketId_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  ticketId_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  ticketId_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  ticketId_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  ticketId_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  ticketId_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
};

export enum SnapshotSent_OrderBy {
  BlockNumber = "blockNumber",
  BlockTimestamp = "blockTimestamp",
  EpochSent = "epochSent",
  Id = "id",
  TicketId = "ticketId",
  TransactionHash = "transactionHash",
}

export type Subscription = {
  __typename?: "Subscription";
  /** Access to subgraph metadata */
  _meta?: Maybe<_Meta_>;
  messageSent?: Maybe<MessageSent>;
  messageSents: Array<MessageSent>;
  node?: Maybe<Node>;
  nodes: Array<Node>;
  receiver?: Maybe<Receiver>;
  receivers: Array<Receiver>;
  sender?: Maybe<Sender>;
  senders: Array<Sender>;
  snapshotSaved?: Maybe<SnapshotSaved>;
  snapshotSaveds: Array<SnapshotSaved>;
  snapshotSent?: Maybe<SnapshotSent>;
  snapshotSents: Array<SnapshotSent>;
};

export type Subscription_MetaArgs = {
  block?: InputMaybe<Block_Height>;
};

export type SubscriptionMessageSentArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionMessageSentsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<MessageSent_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<MessageSent_Filter>;
};

export type SubscriptionNodeArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionNodesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Node_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Node_Filter>;
};

export type SubscriptionReceiverArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionReceiversArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Receiver_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Receiver_Filter>;
};

export type SubscriptionSenderArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionSendersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Sender_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Sender_Filter>;
};

export type SubscriptionSnapshotSavedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionSnapshotSavedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<SnapshotSaved_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SnapshotSaved_Filter>;
};

export type SubscriptionSnapshotSentArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionSnapshotSentsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<SnapshotSent_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SnapshotSent_Filter>;
};

export type _Block_ = {
  __typename?: "_Block_";
  /** The hash of the block */
  hash?: Maybe<Scalars["Bytes"]["output"]>;
  /** The block number */
  number: Scalars["Int"]["output"];
  /** Integer representation of the timestamp stored in blocks for the chain */
  timestamp?: Maybe<Scalars["Int"]["output"]>;
};

/** The type for the top-level _meta field */
export type _Meta_ = {
  __typename?: "_Meta_";
  /**
   * Information about a specific subgraph block. The hash of the block
   * will be null if the _meta field has a block constraint that asks for
   * a block number. It will be filled if the _meta field has no block constraint
   * and therefore asks for the latest  block
   *
   */
  block: _Block_;
  /** The deployment ID */
  deployment: Scalars["String"]["output"];
  /** If `true`, the subgraph encountered indexing errors at some past block */
  hasIndexingErrors: Scalars["Boolean"]["output"];
};

export enum _SubgraphErrorPolicy_ {
  /** Data will be returned even if the subgraph has indexing errors */
  Allow = "allow",
  /** If the subgraph has indexing errors, data will be omitted. The default. */
  Deny = "deny",
}

export type GetCountQueryVariables = Exact<{
  stateRoot: Scalars["Bytes"]["input"];
}>;

export type GetCountQuery = {
  __typename?: "Query";
  snapshotSaveds: Array<{ __typename?: "SnapshotSaved"; count: any }>;
};

export type GetMsgDataQueryVariables = Exact<{
  nonce: Array<Scalars["BigInt"]["input"]> | Scalars["BigInt"]["input"];
}>;

export type GetMsgDataQuery = {
  __typename?: "Query";
  messageSents: Array<{ __typename?: "MessageSent"; nonce: any; data: any; to: { __typename?: "Receiver"; id: any } }>;
};

export type GetNonceFromQueryVariables = Exact<{
  nonce: Scalars["BigInt"]["input"];
  msgSender: Scalars["Bytes"]["input"];
}>;

export type GetNonceFromQuery = {
  __typename?: "Query";
  messageSents: Array<{ __typename?: "MessageSent"; nonce: any }>;
};

export type GetProofQueryVariables = Exact<{
  proofIndices: Array<Scalars["ID"]["input"]> | Scalars["ID"]["input"];
}>;

export type GetProofQuery = { __typename?: "Query"; nodes: Array<{ __typename?: "Node"; id: string; hash: any }> };

export const GetCountDocument = gql`
  query GetCount($stateRoot: Bytes!) {
    snapshotSaveds(where: { stateRoot: $stateRoot }) {
      count
    }
  }
`;
export const GetMsgDataDocument = gql`
  query GetMsgData($nonce: [BigInt!]!) {
    messageSents(first: 5, where: { nonce_in: nonce }) {
      nonce
      to {
        id
      }
      data
    }
  }
`;
export const GetNonceFromDocument = gql`
  query GetNonceFrom($nonce: BigInt!, $msgSender: Bytes!) {
    messageSents(
      first: 1000
      where: { nonce_gte: $nonce, msgSender_: { id: $msgSender } }
      orderBy: nonce
      orderDirection: asc
    ) {
      nonce
    }
  }
`;
export const GetProofDocument = gql`
  query GetProof($proofIndices: [ID!]!) {
    nodes(first: 100, where: { id_in: $proofIndices }) {
      id
      hash
    }
  }
`;

export type SdkFunctionWrapper = <T>(
  action: (requestHeaders?: Record<string, string>) => Promise<T>,
  operationName: string,
  operationType?: string
) => Promise<T>;

const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    GetCount(variables: GetCountQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<GetCountQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetCountQuery>(GetCountDocument, variables, { ...requestHeaders, ...wrappedRequestHeaders }),
        "GetCount",
        "query"
      );
    },
    GetMsgData(
      variables: GetMsgDataQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders
    ): Promise<GetMsgDataQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetMsgDataQuery>(GetMsgDataDocument, variables, {
            ...requestHeaders,
            ...wrappedRequestHeaders,
          }),
        "GetMsgData",
        "query"
      );
    },
    GetNonceFrom(
      variables: GetNonceFromQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders
    ): Promise<GetNonceFromQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetNonceFromQuery>(GetNonceFromDocument, variables, {
            ...requestHeaders,
            ...wrappedRequestHeaders,
          }),
        "GetNonceFrom",
        "query"
      );
    },
    GetProof(variables: GetProofQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<GetProofQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetProofQuery>(GetProofDocument, variables, { ...requestHeaders, ...wrappedRequestHeaders }),
        "GetProof",
        "query"
      );
    },
  };
}
export type Sdk = ReturnType<typeof getSdk>;
