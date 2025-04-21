/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  BigDecimal: any;
  BigInt: any;
  Bytes: any;
  /**
   * 8 bytes signed integer
   *
   */
  Int8: any;
  /**
   * A string representation of microseconds UNIX timestamp (16 digits)
   *
   */
  Timestamp: any;
};

export enum Aggregation_Interval {
  Day = "day",
  Hour = "hour",
}

export type BlockChangedFilter = {
  number_gte: Scalars["Int"];
};

export type Block_Height = {
  hash?: InputMaybe<Scalars["Bytes"]>;
  number?: InputMaybe<Scalars["Int"]>;
  number_gte?: InputMaybe<Scalars["Int"]>;
};

export type Challenge = {
  __typename?: "Challenge";
  challenger: Scalars["Bytes"];
  claim: Claim;
  honest: Scalars["Boolean"];
  id: Scalars["ID"];
  timestamp: Scalars["BigInt"];
  txHash: Scalars["Bytes"];
};

export type Challenge_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Challenge_Filter>>>;
  challenger?: InputMaybe<Scalars["Bytes"]>;
  challenger_contains?: InputMaybe<Scalars["Bytes"]>;
  challenger_gt?: InputMaybe<Scalars["Bytes"]>;
  challenger_gte?: InputMaybe<Scalars["Bytes"]>;
  challenger_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  challenger_lt?: InputMaybe<Scalars["Bytes"]>;
  challenger_lte?: InputMaybe<Scalars["Bytes"]>;
  challenger_not?: InputMaybe<Scalars["Bytes"]>;
  challenger_not_contains?: InputMaybe<Scalars["Bytes"]>;
  challenger_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  claim?: InputMaybe<Scalars["String"]>;
  claim_?: InputMaybe<Claim_Filter>;
  claim_contains?: InputMaybe<Scalars["String"]>;
  claim_contains_nocase?: InputMaybe<Scalars["String"]>;
  claim_ends_with?: InputMaybe<Scalars["String"]>;
  claim_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  claim_gt?: InputMaybe<Scalars["String"]>;
  claim_gte?: InputMaybe<Scalars["String"]>;
  claim_in?: InputMaybe<Array<Scalars["String"]>>;
  claim_lt?: InputMaybe<Scalars["String"]>;
  claim_lte?: InputMaybe<Scalars["String"]>;
  claim_not?: InputMaybe<Scalars["String"]>;
  claim_not_contains?: InputMaybe<Scalars["String"]>;
  claim_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  claim_not_ends_with?: InputMaybe<Scalars["String"]>;
  claim_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  claim_not_in?: InputMaybe<Array<Scalars["String"]>>;
  claim_not_starts_with?: InputMaybe<Scalars["String"]>;
  claim_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  claim_starts_with?: InputMaybe<Scalars["String"]>;
  claim_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  honest?: InputMaybe<Scalars["Boolean"]>;
  honest_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  honest_not?: InputMaybe<Scalars["Boolean"]>;
  honest_not_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  id?: InputMaybe<Scalars["ID"]>;
  id_gt?: InputMaybe<Scalars["ID"]>;
  id_gte?: InputMaybe<Scalars["ID"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]>>;
  id_lt?: InputMaybe<Scalars["ID"]>;
  id_lte?: InputMaybe<Scalars["ID"]>;
  id_not?: InputMaybe<Scalars["ID"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]>>;
  or?: InputMaybe<Array<InputMaybe<Challenge_Filter>>>;
  timestamp?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  txHash?: InputMaybe<Scalars["Bytes"]>;
  txHash_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_gt?: InputMaybe<Scalars["Bytes"]>;
  txHash_gte?: InputMaybe<Scalars["Bytes"]>;
  txHash_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  txHash_lt?: InputMaybe<Scalars["Bytes"]>;
  txHash_lte?: InputMaybe<Scalars["Bytes"]>;
  txHash_not?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
};

export enum Challenge_OrderBy {
  Challenger = "challenger",
  Claim = "claim",
  ClaimBridger = "claim__bridger",
  ClaimChallenged = "claim__challenged",
  ClaimEpoch = "claim__epoch",
  ClaimHonest = "claim__honest",
  ClaimId = "claim__id",
  ClaimStateroot = "claim__stateroot",
  ClaimTimestamp = "claim__timestamp",
  ClaimTxHash = "claim__txHash",
  ClaimVerified = "claim__verified",
  Honest = "honest",
  Id = "id",
  Timestamp = "timestamp",
  TxHash = "txHash",
}

export type Claim = {
  __typename?: "Claim";
  bridger: Scalars["Bytes"];
  challenge?: Maybe<Challenge>;
  challenged: Scalars["Boolean"];
  epoch: Scalars["BigInt"];
  honest: Scalars["Boolean"];
  id: Scalars["ID"];
  outbox: Outbox;
  stateroot: Scalars["Bytes"];
  timestamp: Scalars["BigInt"];
  txHash: Scalars["Bytes"];
  verification?: Maybe<Verification>;
  verified: Scalars["Boolean"];
};

export type Claim_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Claim_Filter>>>;
  bridger?: InputMaybe<Scalars["Bytes"]>;
  bridger_contains?: InputMaybe<Scalars["Bytes"]>;
  bridger_gt?: InputMaybe<Scalars["Bytes"]>;
  bridger_gte?: InputMaybe<Scalars["Bytes"]>;
  bridger_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  bridger_lt?: InputMaybe<Scalars["Bytes"]>;
  bridger_lte?: InputMaybe<Scalars["Bytes"]>;
  bridger_not?: InputMaybe<Scalars["Bytes"]>;
  bridger_not_contains?: InputMaybe<Scalars["Bytes"]>;
  bridger_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  challenge_?: InputMaybe<Challenge_Filter>;
  challenged?: InputMaybe<Scalars["Boolean"]>;
  challenged_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  challenged_not?: InputMaybe<Scalars["Boolean"]>;
  challenged_not_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  epoch?: InputMaybe<Scalars["BigInt"]>;
  epoch_gt?: InputMaybe<Scalars["BigInt"]>;
  epoch_gte?: InputMaybe<Scalars["BigInt"]>;
  epoch_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  epoch_lt?: InputMaybe<Scalars["BigInt"]>;
  epoch_lte?: InputMaybe<Scalars["BigInt"]>;
  epoch_not?: InputMaybe<Scalars["BigInt"]>;
  epoch_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  honest?: InputMaybe<Scalars["Boolean"]>;
  honest_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  honest_not?: InputMaybe<Scalars["Boolean"]>;
  honest_not_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  id?: InputMaybe<Scalars["ID"]>;
  id_gt?: InputMaybe<Scalars["ID"]>;
  id_gte?: InputMaybe<Scalars["ID"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]>>;
  id_lt?: InputMaybe<Scalars["ID"]>;
  id_lte?: InputMaybe<Scalars["ID"]>;
  id_not?: InputMaybe<Scalars["ID"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]>>;
  or?: InputMaybe<Array<InputMaybe<Claim_Filter>>>;
  outbox?: InputMaybe<Scalars["String"]>;
  outbox_?: InputMaybe<Outbox_Filter>;
  outbox_contains?: InputMaybe<Scalars["String"]>;
  outbox_contains_nocase?: InputMaybe<Scalars["String"]>;
  outbox_ends_with?: InputMaybe<Scalars["String"]>;
  outbox_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  outbox_gt?: InputMaybe<Scalars["String"]>;
  outbox_gte?: InputMaybe<Scalars["String"]>;
  outbox_in?: InputMaybe<Array<Scalars["String"]>>;
  outbox_lt?: InputMaybe<Scalars["String"]>;
  outbox_lte?: InputMaybe<Scalars["String"]>;
  outbox_not?: InputMaybe<Scalars["String"]>;
  outbox_not_contains?: InputMaybe<Scalars["String"]>;
  outbox_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  outbox_not_ends_with?: InputMaybe<Scalars["String"]>;
  outbox_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  outbox_not_in?: InputMaybe<Array<Scalars["String"]>>;
  outbox_not_starts_with?: InputMaybe<Scalars["String"]>;
  outbox_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  outbox_starts_with?: InputMaybe<Scalars["String"]>;
  outbox_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  stateroot?: InputMaybe<Scalars["Bytes"]>;
  stateroot_contains?: InputMaybe<Scalars["Bytes"]>;
  stateroot_gt?: InputMaybe<Scalars["Bytes"]>;
  stateroot_gte?: InputMaybe<Scalars["Bytes"]>;
  stateroot_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  stateroot_lt?: InputMaybe<Scalars["Bytes"]>;
  stateroot_lte?: InputMaybe<Scalars["Bytes"]>;
  stateroot_not?: InputMaybe<Scalars["Bytes"]>;
  stateroot_not_contains?: InputMaybe<Scalars["Bytes"]>;
  stateroot_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  timestamp?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  txHash?: InputMaybe<Scalars["Bytes"]>;
  txHash_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_gt?: InputMaybe<Scalars["Bytes"]>;
  txHash_gte?: InputMaybe<Scalars["Bytes"]>;
  txHash_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  txHash_lt?: InputMaybe<Scalars["Bytes"]>;
  txHash_lte?: InputMaybe<Scalars["Bytes"]>;
  txHash_not?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  verification_?: InputMaybe<Verification_Filter>;
  verified?: InputMaybe<Scalars["Boolean"]>;
  verified_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  verified_not?: InputMaybe<Scalars["Boolean"]>;
  verified_not_in?: InputMaybe<Array<Scalars["Boolean"]>>;
};

export enum Claim_OrderBy {
  Bridger = "bridger",
  Challenge = "challenge",
  ChallengeChallenger = "challenge__challenger",
  ChallengeHonest = "challenge__honest",
  ChallengeId = "challenge__id",
  ChallengeTimestamp = "challenge__timestamp",
  ChallengeTxHash = "challenge__txHash",
  Challenged = "challenged",
  Epoch = "epoch",
  Honest = "honest",
  Id = "id",
  Outbox = "outbox",
  OutboxId = "outbox__id",
  Stateroot = "stateroot",
  Timestamp = "timestamp",
  TxHash = "txHash",
  Verification = "verification",
  VerificationId = "verification__id",
  VerificationStartCaller = "verification__startCaller",
  VerificationStartTimestamp = "verification__startTimestamp",
  VerificationStartTxHash = "verification__startTxHash",
  VerificationVerifiedCaller = "verification__verifiedCaller",
  VerificationVerifiedTimestamp = "verification__verifiedTimestamp",
  VerificationVerifiedTxHash = "verification__verifiedTxHash",
  Verified = "verified",
}

export type Fallback = {
  __typename?: "Fallback";
  executor: Scalars["Bytes"];
  id: Scalars["ID"];
  snapshot: Snapshot;
  ticketId: Scalars["Bytes"];
  timestamp?: Maybe<Scalars["BigInt"]>;
  txHash: Scalars["Bytes"];
};

export type Fallback_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Fallback_Filter>>>;
  executor?: InputMaybe<Scalars["Bytes"]>;
  executor_contains?: InputMaybe<Scalars["Bytes"]>;
  executor_gt?: InputMaybe<Scalars["Bytes"]>;
  executor_gte?: InputMaybe<Scalars["Bytes"]>;
  executor_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  executor_lt?: InputMaybe<Scalars["Bytes"]>;
  executor_lte?: InputMaybe<Scalars["Bytes"]>;
  executor_not?: InputMaybe<Scalars["Bytes"]>;
  executor_not_contains?: InputMaybe<Scalars["Bytes"]>;
  executor_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  id?: InputMaybe<Scalars["ID"]>;
  id_gt?: InputMaybe<Scalars["ID"]>;
  id_gte?: InputMaybe<Scalars["ID"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]>>;
  id_lt?: InputMaybe<Scalars["ID"]>;
  id_lte?: InputMaybe<Scalars["ID"]>;
  id_not?: InputMaybe<Scalars["ID"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]>>;
  or?: InputMaybe<Array<InputMaybe<Fallback_Filter>>>;
  snapshot?: InputMaybe<Scalars["String"]>;
  snapshot_?: InputMaybe<Snapshot_Filter>;
  snapshot_contains?: InputMaybe<Scalars["String"]>;
  snapshot_contains_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_ends_with?: InputMaybe<Scalars["String"]>;
  snapshot_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_gt?: InputMaybe<Scalars["String"]>;
  snapshot_gte?: InputMaybe<Scalars["String"]>;
  snapshot_in?: InputMaybe<Array<Scalars["String"]>>;
  snapshot_lt?: InputMaybe<Scalars["String"]>;
  snapshot_lte?: InputMaybe<Scalars["String"]>;
  snapshot_not?: InputMaybe<Scalars["String"]>;
  snapshot_not_contains?: InputMaybe<Scalars["String"]>;
  snapshot_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_not_ends_with?: InputMaybe<Scalars["String"]>;
  snapshot_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_not_in?: InputMaybe<Array<Scalars["String"]>>;
  snapshot_not_starts_with?: InputMaybe<Scalars["String"]>;
  snapshot_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_starts_with?: InputMaybe<Scalars["String"]>;
  snapshot_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  ticketId?: InputMaybe<Scalars["Bytes"]>;
  ticketId_contains?: InputMaybe<Scalars["Bytes"]>;
  ticketId_gt?: InputMaybe<Scalars["Bytes"]>;
  ticketId_gte?: InputMaybe<Scalars["Bytes"]>;
  ticketId_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  ticketId_lt?: InputMaybe<Scalars["Bytes"]>;
  ticketId_lte?: InputMaybe<Scalars["Bytes"]>;
  ticketId_not?: InputMaybe<Scalars["Bytes"]>;
  ticketId_not_contains?: InputMaybe<Scalars["Bytes"]>;
  ticketId_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  timestamp?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  txHash?: InputMaybe<Scalars["Bytes"]>;
  txHash_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_gt?: InputMaybe<Scalars["Bytes"]>;
  txHash_gte?: InputMaybe<Scalars["Bytes"]>;
  txHash_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  txHash_lt?: InputMaybe<Scalars["Bytes"]>;
  txHash_lte?: InputMaybe<Scalars["Bytes"]>;
  txHash_not?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
};

export enum Fallback_OrderBy {
  Executor = "executor",
  Id = "id",
  Snapshot = "snapshot",
  SnapshotCaller = "snapshot__caller",
  SnapshotEpoch = "snapshot__epoch",
  SnapshotEpochString = "snapshot__epochString",
  SnapshotId = "snapshot__id",
  SnapshotNumberMessages = "snapshot__numberMessages",
  SnapshotResolving = "snapshot__resolving",
  SnapshotSaved = "snapshot__saved",
  SnapshotStateRoot = "snapshot__stateRoot",
  SnapshotStateRootString = "snapshot__stateRootString",
  SnapshotTimestamp = "snapshot__timestamp",
  SnapshotTxHash = "snapshot__txHash",
  TicketId = "ticketId",
  Timestamp = "timestamp",
  TxHash = "txHash",
}

export type Inbox = {
  __typename?: "Inbox";
  id: Scalars["Bytes"];
  messages: Array<Snapshot>;
};

export type InboxMessagesArgs = {
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Snapshot_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  where?: InputMaybe<Snapshot_Filter>;
};

export type Inbox_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Inbox_Filter>>>;
  id?: InputMaybe<Scalars["Bytes"]>;
  id_contains?: InputMaybe<Scalars["Bytes"]>;
  id_gt?: InputMaybe<Scalars["Bytes"]>;
  id_gte?: InputMaybe<Scalars["Bytes"]>;
  id_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  id_lt?: InputMaybe<Scalars["Bytes"]>;
  id_lte?: InputMaybe<Scalars["Bytes"]>;
  id_not?: InputMaybe<Scalars["Bytes"]>;
  id_not_contains?: InputMaybe<Scalars["Bytes"]>;
  id_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  messages_?: InputMaybe<Snapshot_Filter>;
  or?: InputMaybe<Array<InputMaybe<Inbox_Filter>>>;
};

export enum Inbox_OrderBy {
  Id = "id",
  Messages = "messages",
}

export type Message = {
  __typename?: "Message";
  data: Scalars["Bytes"];
  from: Scalars["Bytes"];
  id: Scalars["ID"];
  outbox: Outbox;
  proof: Scalars["Bytes"];
  relayer: Scalars["Bytes"];
  snapshot: Snapshot;
  timestamp: Scalars["BigInt"];
  to: Scalars["Bytes"];
  txHash: Scalars["Bytes"];
};

export type Message_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Message_Filter>>>;
  data?: InputMaybe<Scalars["Bytes"]>;
  data_contains?: InputMaybe<Scalars["Bytes"]>;
  data_gt?: InputMaybe<Scalars["Bytes"]>;
  data_gte?: InputMaybe<Scalars["Bytes"]>;
  data_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  data_lt?: InputMaybe<Scalars["Bytes"]>;
  data_lte?: InputMaybe<Scalars["Bytes"]>;
  data_not?: InputMaybe<Scalars["Bytes"]>;
  data_not_contains?: InputMaybe<Scalars["Bytes"]>;
  data_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  from?: InputMaybe<Scalars["Bytes"]>;
  from_contains?: InputMaybe<Scalars["Bytes"]>;
  from_gt?: InputMaybe<Scalars["Bytes"]>;
  from_gte?: InputMaybe<Scalars["Bytes"]>;
  from_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  from_lt?: InputMaybe<Scalars["Bytes"]>;
  from_lte?: InputMaybe<Scalars["Bytes"]>;
  from_not?: InputMaybe<Scalars["Bytes"]>;
  from_not_contains?: InputMaybe<Scalars["Bytes"]>;
  from_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  id?: InputMaybe<Scalars["ID"]>;
  id_gt?: InputMaybe<Scalars["ID"]>;
  id_gte?: InputMaybe<Scalars["ID"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]>>;
  id_lt?: InputMaybe<Scalars["ID"]>;
  id_lte?: InputMaybe<Scalars["ID"]>;
  id_not?: InputMaybe<Scalars["ID"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]>>;
  or?: InputMaybe<Array<InputMaybe<Message_Filter>>>;
  outbox?: InputMaybe<Scalars["String"]>;
  outbox_?: InputMaybe<Outbox_Filter>;
  outbox_contains?: InputMaybe<Scalars["String"]>;
  outbox_contains_nocase?: InputMaybe<Scalars["String"]>;
  outbox_ends_with?: InputMaybe<Scalars["String"]>;
  outbox_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  outbox_gt?: InputMaybe<Scalars["String"]>;
  outbox_gte?: InputMaybe<Scalars["String"]>;
  outbox_in?: InputMaybe<Array<Scalars["String"]>>;
  outbox_lt?: InputMaybe<Scalars["String"]>;
  outbox_lte?: InputMaybe<Scalars["String"]>;
  outbox_not?: InputMaybe<Scalars["String"]>;
  outbox_not_contains?: InputMaybe<Scalars["String"]>;
  outbox_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  outbox_not_ends_with?: InputMaybe<Scalars["String"]>;
  outbox_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  outbox_not_in?: InputMaybe<Array<Scalars["String"]>>;
  outbox_not_starts_with?: InputMaybe<Scalars["String"]>;
  outbox_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  outbox_starts_with?: InputMaybe<Scalars["String"]>;
  outbox_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  proof?: InputMaybe<Scalars["Bytes"]>;
  proof_contains?: InputMaybe<Scalars["Bytes"]>;
  proof_gt?: InputMaybe<Scalars["Bytes"]>;
  proof_gte?: InputMaybe<Scalars["Bytes"]>;
  proof_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  proof_lt?: InputMaybe<Scalars["Bytes"]>;
  proof_lte?: InputMaybe<Scalars["Bytes"]>;
  proof_not?: InputMaybe<Scalars["Bytes"]>;
  proof_not_contains?: InputMaybe<Scalars["Bytes"]>;
  proof_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  relayer?: InputMaybe<Scalars["Bytes"]>;
  relayer_contains?: InputMaybe<Scalars["Bytes"]>;
  relayer_gt?: InputMaybe<Scalars["Bytes"]>;
  relayer_gte?: InputMaybe<Scalars["Bytes"]>;
  relayer_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  relayer_lt?: InputMaybe<Scalars["Bytes"]>;
  relayer_lte?: InputMaybe<Scalars["Bytes"]>;
  relayer_not?: InputMaybe<Scalars["Bytes"]>;
  relayer_not_contains?: InputMaybe<Scalars["Bytes"]>;
  relayer_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  snapshot?: InputMaybe<Scalars["String"]>;
  snapshot_?: InputMaybe<Snapshot_Filter>;
  snapshot_contains?: InputMaybe<Scalars["String"]>;
  snapshot_contains_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_ends_with?: InputMaybe<Scalars["String"]>;
  snapshot_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_gt?: InputMaybe<Scalars["String"]>;
  snapshot_gte?: InputMaybe<Scalars["String"]>;
  snapshot_in?: InputMaybe<Array<Scalars["String"]>>;
  snapshot_lt?: InputMaybe<Scalars["String"]>;
  snapshot_lte?: InputMaybe<Scalars["String"]>;
  snapshot_not?: InputMaybe<Scalars["String"]>;
  snapshot_not_contains?: InputMaybe<Scalars["String"]>;
  snapshot_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_not_ends_with?: InputMaybe<Scalars["String"]>;
  snapshot_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_not_in?: InputMaybe<Array<Scalars["String"]>>;
  snapshot_not_starts_with?: InputMaybe<Scalars["String"]>;
  snapshot_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  snapshot_starts_with?: InputMaybe<Scalars["String"]>;
  snapshot_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  timestamp?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  to?: InputMaybe<Scalars["Bytes"]>;
  to_contains?: InputMaybe<Scalars["Bytes"]>;
  to_gt?: InputMaybe<Scalars["Bytes"]>;
  to_gte?: InputMaybe<Scalars["Bytes"]>;
  to_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  to_lt?: InputMaybe<Scalars["Bytes"]>;
  to_lte?: InputMaybe<Scalars["Bytes"]>;
  to_not?: InputMaybe<Scalars["Bytes"]>;
  to_not_contains?: InputMaybe<Scalars["Bytes"]>;
  to_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  txHash?: InputMaybe<Scalars["Bytes"]>;
  txHash_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_gt?: InputMaybe<Scalars["Bytes"]>;
  txHash_gte?: InputMaybe<Scalars["Bytes"]>;
  txHash_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  txHash_lt?: InputMaybe<Scalars["Bytes"]>;
  txHash_lte?: InputMaybe<Scalars["Bytes"]>;
  txHash_not?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
};

export enum Message_OrderBy {
  Data = "data",
  From = "from",
  Id = "id",
  Outbox = "outbox",
  OutboxId = "outbox__id",
  Proof = "proof",
  Relayer = "relayer",
  Snapshot = "snapshot",
  SnapshotCaller = "snapshot__caller",
  SnapshotEpoch = "snapshot__epoch",
  SnapshotEpochString = "snapshot__epochString",
  SnapshotId = "snapshot__id",
  SnapshotNumberMessages = "snapshot__numberMessages",
  SnapshotResolving = "snapshot__resolving",
  SnapshotSaved = "snapshot__saved",
  SnapshotStateRoot = "snapshot__stateRoot",
  SnapshotStateRootString = "snapshot__stateRootString",
  SnapshotTimestamp = "snapshot__timestamp",
  SnapshotTxHash = "snapshot__txHash",
  Timestamp = "timestamp",
  To = "to",
  TxHash = "txHash",
}

/** Defines the order direction, either ascending or descending */
export enum OrderDirection {
  Asc = "asc",
  Desc = "desc",
}

export type Outbox = {
  __typename?: "Outbox";
  claims: Array<Claim>;
  id: Scalars["Bytes"];
};

export type OutboxClaimsArgs = {
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Claim_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  where?: InputMaybe<Claim_Filter>;
};

export type Outbox_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Outbox_Filter>>>;
  claims_?: InputMaybe<Claim_Filter>;
  id?: InputMaybe<Scalars["Bytes"]>;
  id_contains?: InputMaybe<Scalars["Bytes"]>;
  id_gt?: InputMaybe<Scalars["Bytes"]>;
  id_gte?: InputMaybe<Scalars["Bytes"]>;
  id_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  id_lt?: InputMaybe<Scalars["Bytes"]>;
  id_lte?: InputMaybe<Scalars["Bytes"]>;
  id_not?: InputMaybe<Scalars["Bytes"]>;
  id_not_contains?: InputMaybe<Scalars["Bytes"]>;
  id_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  or?: InputMaybe<Array<InputMaybe<Outbox_Filter>>>;
};

export enum Outbox_OrderBy {
  Claims = "claims",
  Id = "id",
}

export type Query = {
  __typename?: "Query";
  /** Access to subgraph metadata */
  _meta?: Maybe<_Meta_>;
  challenge?: Maybe<Challenge>;
  challenges: Array<Challenge>;
  claim?: Maybe<Claim>;
  claims: Array<Claim>;
  fallback?: Maybe<Fallback>;
  fallbacks: Array<Fallback>;
  inbox?: Maybe<Inbox>;
  inboxes: Array<Inbox>;
  message?: Maybe<Message>;
  messages: Array<Message>;
  outbox?: Maybe<Outbox>;
  outboxes: Array<Outbox>;
  ref?: Maybe<Ref>;
  refs: Array<Ref>;
  snapshot?: Maybe<Snapshot>;
  snapshotQuery: Array<Snapshot>;
  snapshots: Array<Snapshot>;
  verification?: Maybe<Verification>;
  verifications: Array<Verification>;
};

export type Query_MetaArgs = {
  block?: InputMaybe<Block_Height>;
};

export type QueryChallengeArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryChallengesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Challenge_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Challenge_Filter>;
};

export type QueryClaimArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryClaimsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Claim_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Claim_Filter>;
};

export type QueryFallbackArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryFallbacksArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Fallback_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Fallback_Filter>;
};

export type QueryInboxArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryInboxesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Inbox_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Inbox_Filter>;
};

export type QueryMessageArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryMessagesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Message_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Message_Filter>;
};

export type QueryOutboxArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryOutboxesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Outbox_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Outbox_Filter>;
};

export type QueryRefArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryRefsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Ref_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Ref_Filter>;
};

export type QuerySnapshotArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QuerySnapshotQueryArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  text: Scalars["String"];
  where?: InputMaybe<Snapshot_Filter>;
};

export type QuerySnapshotsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Snapshot_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Snapshot_Filter>;
};

export type QueryVerificationArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryVerificationsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Verification_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Verification_Filter>;
};

export type Ref = {
  __typename?: "Ref";
  currentSnapshotIndex: Scalars["BigInt"];
  id: Scalars["ID"];
  inbox: Inbox;
  nextMessageIndex: Scalars["BigInt"];
  outbox: Outbox;
  totalChallenges: Scalars["BigInt"];
  totalClaims: Scalars["BigInt"];
  totalMessages: Scalars["BigInt"];
};

export type Ref_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Ref_Filter>>>;
  currentSnapshotIndex?: InputMaybe<Scalars["BigInt"]>;
  currentSnapshotIndex_gt?: InputMaybe<Scalars["BigInt"]>;
  currentSnapshotIndex_gte?: InputMaybe<Scalars["BigInt"]>;
  currentSnapshotIndex_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  currentSnapshotIndex_lt?: InputMaybe<Scalars["BigInt"]>;
  currentSnapshotIndex_lte?: InputMaybe<Scalars["BigInt"]>;
  currentSnapshotIndex_not?: InputMaybe<Scalars["BigInt"]>;
  currentSnapshotIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  id?: InputMaybe<Scalars["ID"]>;
  id_gt?: InputMaybe<Scalars["ID"]>;
  id_gte?: InputMaybe<Scalars["ID"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]>>;
  id_lt?: InputMaybe<Scalars["ID"]>;
  id_lte?: InputMaybe<Scalars["ID"]>;
  id_not?: InputMaybe<Scalars["ID"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]>>;
  inbox?: InputMaybe<Scalars["String"]>;
  inbox_?: InputMaybe<Inbox_Filter>;
  inbox_contains?: InputMaybe<Scalars["String"]>;
  inbox_contains_nocase?: InputMaybe<Scalars["String"]>;
  inbox_ends_with?: InputMaybe<Scalars["String"]>;
  inbox_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  inbox_gt?: InputMaybe<Scalars["String"]>;
  inbox_gte?: InputMaybe<Scalars["String"]>;
  inbox_in?: InputMaybe<Array<Scalars["String"]>>;
  inbox_lt?: InputMaybe<Scalars["String"]>;
  inbox_lte?: InputMaybe<Scalars["String"]>;
  inbox_not?: InputMaybe<Scalars["String"]>;
  inbox_not_contains?: InputMaybe<Scalars["String"]>;
  inbox_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  inbox_not_ends_with?: InputMaybe<Scalars["String"]>;
  inbox_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  inbox_not_in?: InputMaybe<Array<Scalars["String"]>>;
  inbox_not_starts_with?: InputMaybe<Scalars["String"]>;
  inbox_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  inbox_starts_with?: InputMaybe<Scalars["String"]>;
  inbox_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  nextMessageIndex?: InputMaybe<Scalars["BigInt"]>;
  nextMessageIndex_gt?: InputMaybe<Scalars["BigInt"]>;
  nextMessageIndex_gte?: InputMaybe<Scalars["BigInt"]>;
  nextMessageIndex_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  nextMessageIndex_lt?: InputMaybe<Scalars["BigInt"]>;
  nextMessageIndex_lte?: InputMaybe<Scalars["BigInt"]>;
  nextMessageIndex_not?: InputMaybe<Scalars["BigInt"]>;
  nextMessageIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  or?: InputMaybe<Array<InputMaybe<Ref_Filter>>>;
  outbox?: InputMaybe<Scalars["String"]>;
  outbox_?: InputMaybe<Outbox_Filter>;
  outbox_contains?: InputMaybe<Scalars["String"]>;
  outbox_contains_nocase?: InputMaybe<Scalars["String"]>;
  outbox_ends_with?: InputMaybe<Scalars["String"]>;
  outbox_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  outbox_gt?: InputMaybe<Scalars["String"]>;
  outbox_gte?: InputMaybe<Scalars["String"]>;
  outbox_in?: InputMaybe<Array<Scalars["String"]>>;
  outbox_lt?: InputMaybe<Scalars["String"]>;
  outbox_lte?: InputMaybe<Scalars["String"]>;
  outbox_not?: InputMaybe<Scalars["String"]>;
  outbox_not_contains?: InputMaybe<Scalars["String"]>;
  outbox_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  outbox_not_ends_with?: InputMaybe<Scalars["String"]>;
  outbox_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  outbox_not_in?: InputMaybe<Array<Scalars["String"]>>;
  outbox_not_starts_with?: InputMaybe<Scalars["String"]>;
  outbox_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  outbox_starts_with?: InputMaybe<Scalars["String"]>;
  outbox_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  totalChallenges?: InputMaybe<Scalars["BigInt"]>;
  totalChallenges_gt?: InputMaybe<Scalars["BigInt"]>;
  totalChallenges_gte?: InputMaybe<Scalars["BigInt"]>;
  totalChallenges_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  totalChallenges_lt?: InputMaybe<Scalars["BigInt"]>;
  totalChallenges_lte?: InputMaybe<Scalars["BigInt"]>;
  totalChallenges_not?: InputMaybe<Scalars["BigInt"]>;
  totalChallenges_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  totalClaims?: InputMaybe<Scalars["BigInt"]>;
  totalClaims_gt?: InputMaybe<Scalars["BigInt"]>;
  totalClaims_gte?: InputMaybe<Scalars["BigInt"]>;
  totalClaims_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  totalClaims_lt?: InputMaybe<Scalars["BigInt"]>;
  totalClaims_lte?: InputMaybe<Scalars["BigInt"]>;
  totalClaims_not?: InputMaybe<Scalars["BigInt"]>;
  totalClaims_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  totalMessages?: InputMaybe<Scalars["BigInt"]>;
  totalMessages_gt?: InputMaybe<Scalars["BigInt"]>;
  totalMessages_gte?: InputMaybe<Scalars["BigInt"]>;
  totalMessages_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  totalMessages_lt?: InputMaybe<Scalars["BigInt"]>;
  totalMessages_lte?: InputMaybe<Scalars["BigInt"]>;
  totalMessages_not?: InputMaybe<Scalars["BigInt"]>;
  totalMessages_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
};

export enum Ref_OrderBy {
  CurrentSnapshotIndex = "currentSnapshotIndex",
  Id = "id",
  Inbox = "inbox",
  InboxId = "inbox__id",
  NextMessageIndex = "nextMessageIndex",
  Outbox = "outbox",
  OutboxId = "outbox__id",
  TotalChallenges = "totalChallenges",
  TotalClaims = "totalClaims",
  TotalMessages = "totalMessages",
}

export type Snapshot = {
  __typename?: "Snapshot";
  caller?: Maybe<Scalars["Bytes"]>;
  epoch?: Maybe<Scalars["BigInt"]>;
  epochString?: Maybe<Scalars["String"]>;
  fallback: Array<Fallback>;
  id: Scalars["ID"];
  inbox: Inbox;
  messages: Array<Message>;
  numberMessages: Scalars["BigInt"];
  resolving: Scalars["Boolean"];
  saved: Scalars["Boolean"];
  stateRoot?: Maybe<Scalars["Bytes"]>;
  stateRootString?: Maybe<Scalars["String"]>;
  timestamp?: Maybe<Scalars["BigInt"]>;
  txHash?: Maybe<Scalars["Bytes"]>;
};

export type SnapshotFallbackArgs = {
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Fallback_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  where?: InputMaybe<Fallback_Filter>;
};

export type SnapshotMessagesArgs = {
  first?: InputMaybe<Scalars["Int"]>;
  orderBy?: InputMaybe<Message_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]>;
  where?: InputMaybe<Message_Filter>;
};

export type Snapshot_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Snapshot_Filter>>>;
  caller?: InputMaybe<Scalars["Bytes"]>;
  caller_contains?: InputMaybe<Scalars["Bytes"]>;
  caller_gt?: InputMaybe<Scalars["Bytes"]>;
  caller_gte?: InputMaybe<Scalars["Bytes"]>;
  caller_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  caller_lt?: InputMaybe<Scalars["Bytes"]>;
  caller_lte?: InputMaybe<Scalars["Bytes"]>;
  caller_not?: InputMaybe<Scalars["Bytes"]>;
  caller_not_contains?: InputMaybe<Scalars["Bytes"]>;
  caller_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  epoch?: InputMaybe<Scalars["BigInt"]>;
  epochString?: InputMaybe<Scalars["String"]>;
  epochString_contains?: InputMaybe<Scalars["String"]>;
  epochString_contains_nocase?: InputMaybe<Scalars["String"]>;
  epochString_ends_with?: InputMaybe<Scalars["String"]>;
  epochString_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  epochString_gt?: InputMaybe<Scalars["String"]>;
  epochString_gte?: InputMaybe<Scalars["String"]>;
  epochString_in?: InputMaybe<Array<Scalars["String"]>>;
  epochString_lt?: InputMaybe<Scalars["String"]>;
  epochString_lte?: InputMaybe<Scalars["String"]>;
  epochString_not?: InputMaybe<Scalars["String"]>;
  epochString_not_contains?: InputMaybe<Scalars["String"]>;
  epochString_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  epochString_not_ends_with?: InputMaybe<Scalars["String"]>;
  epochString_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  epochString_not_in?: InputMaybe<Array<Scalars["String"]>>;
  epochString_not_starts_with?: InputMaybe<Scalars["String"]>;
  epochString_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  epochString_starts_with?: InputMaybe<Scalars["String"]>;
  epochString_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  epoch_gt?: InputMaybe<Scalars["BigInt"]>;
  epoch_gte?: InputMaybe<Scalars["BigInt"]>;
  epoch_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  epoch_lt?: InputMaybe<Scalars["BigInt"]>;
  epoch_lte?: InputMaybe<Scalars["BigInt"]>;
  epoch_not?: InputMaybe<Scalars["BigInt"]>;
  epoch_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  fallback_?: InputMaybe<Fallback_Filter>;
  id?: InputMaybe<Scalars["ID"]>;
  id_gt?: InputMaybe<Scalars["ID"]>;
  id_gte?: InputMaybe<Scalars["ID"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]>>;
  id_lt?: InputMaybe<Scalars["ID"]>;
  id_lte?: InputMaybe<Scalars["ID"]>;
  id_not?: InputMaybe<Scalars["ID"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]>>;
  inbox?: InputMaybe<Scalars["String"]>;
  inbox_?: InputMaybe<Inbox_Filter>;
  inbox_contains?: InputMaybe<Scalars["String"]>;
  inbox_contains_nocase?: InputMaybe<Scalars["String"]>;
  inbox_ends_with?: InputMaybe<Scalars["String"]>;
  inbox_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  inbox_gt?: InputMaybe<Scalars["String"]>;
  inbox_gte?: InputMaybe<Scalars["String"]>;
  inbox_in?: InputMaybe<Array<Scalars["String"]>>;
  inbox_lt?: InputMaybe<Scalars["String"]>;
  inbox_lte?: InputMaybe<Scalars["String"]>;
  inbox_not?: InputMaybe<Scalars["String"]>;
  inbox_not_contains?: InputMaybe<Scalars["String"]>;
  inbox_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  inbox_not_ends_with?: InputMaybe<Scalars["String"]>;
  inbox_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  inbox_not_in?: InputMaybe<Array<Scalars["String"]>>;
  inbox_not_starts_with?: InputMaybe<Scalars["String"]>;
  inbox_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  inbox_starts_with?: InputMaybe<Scalars["String"]>;
  inbox_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  messages_?: InputMaybe<Message_Filter>;
  numberMessages?: InputMaybe<Scalars["BigInt"]>;
  numberMessages_gt?: InputMaybe<Scalars["BigInt"]>;
  numberMessages_gte?: InputMaybe<Scalars["BigInt"]>;
  numberMessages_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  numberMessages_lt?: InputMaybe<Scalars["BigInt"]>;
  numberMessages_lte?: InputMaybe<Scalars["BigInt"]>;
  numberMessages_not?: InputMaybe<Scalars["BigInt"]>;
  numberMessages_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  or?: InputMaybe<Array<InputMaybe<Snapshot_Filter>>>;
  resolving?: InputMaybe<Scalars["Boolean"]>;
  resolving_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  resolving_not?: InputMaybe<Scalars["Boolean"]>;
  resolving_not_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  saved?: InputMaybe<Scalars["Boolean"]>;
  saved_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  saved_not?: InputMaybe<Scalars["Boolean"]>;
  saved_not_in?: InputMaybe<Array<Scalars["Boolean"]>>;
  stateRoot?: InputMaybe<Scalars["Bytes"]>;
  stateRootString?: InputMaybe<Scalars["String"]>;
  stateRootString_contains?: InputMaybe<Scalars["String"]>;
  stateRootString_contains_nocase?: InputMaybe<Scalars["String"]>;
  stateRootString_ends_with?: InputMaybe<Scalars["String"]>;
  stateRootString_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  stateRootString_gt?: InputMaybe<Scalars["String"]>;
  stateRootString_gte?: InputMaybe<Scalars["String"]>;
  stateRootString_in?: InputMaybe<Array<Scalars["String"]>>;
  stateRootString_lt?: InputMaybe<Scalars["String"]>;
  stateRootString_lte?: InputMaybe<Scalars["String"]>;
  stateRootString_not?: InputMaybe<Scalars["String"]>;
  stateRootString_not_contains?: InputMaybe<Scalars["String"]>;
  stateRootString_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  stateRootString_not_ends_with?: InputMaybe<Scalars["String"]>;
  stateRootString_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  stateRootString_not_in?: InputMaybe<Array<Scalars["String"]>>;
  stateRootString_not_starts_with?: InputMaybe<Scalars["String"]>;
  stateRootString_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  stateRootString_starts_with?: InputMaybe<Scalars["String"]>;
  stateRootString_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  stateRoot_contains?: InputMaybe<Scalars["Bytes"]>;
  stateRoot_gt?: InputMaybe<Scalars["Bytes"]>;
  stateRoot_gte?: InputMaybe<Scalars["Bytes"]>;
  stateRoot_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  stateRoot_lt?: InputMaybe<Scalars["Bytes"]>;
  stateRoot_lte?: InputMaybe<Scalars["Bytes"]>;
  stateRoot_not?: InputMaybe<Scalars["Bytes"]>;
  stateRoot_not_contains?: InputMaybe<Scalars["Bytes"]>;
  stateRoot_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  timestamp?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  txHash?: InputMaybe<Scalars["Bytes"]>;
  txHash_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_gt?: InputMaybe<Scalars["Bytes"]>;
  txHash_gte?: InputMaybe<Scalars["Bytes"]>;
  txHash_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  txHash_lt?: InputMaybe<Scalars["Bytes"]>;
  txHash_lte?: InputMaybe<Scalars["Bytes"]>;
  txHash_not?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_contains?: InputMaybe<Scalars["Bytes"]>;
  txHash_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
};

export enum Snapshot_OrderBy {
  Caller = "caller",
  Epoch = "epoch",
  EpochString = "epochString",
  Fallback = "fallback",
  Id = "id",
  Inbox = "inbox",
  InboxId = "inbox__id",
  Messages = "messages",
  NumberMessages = "numberMessages",
  Resolving = "resolving",
  Saved = "saved",
  StateRoot = "stateRoot",
  StateRootString = "stateRootString",
  Timestamp = "timestamp",
  TxHash = "txHash",
}

export type Verification = {
  __typename?: "Verification";
  claim: Claim;
  id: Scalars["ID"];
  startCaller?: Maybe<Scalars["Bytes"]>;
  startTimestamp?: Maybe<Scalars["BigInt"]>;
  startTxHash?: Maybe<Scalars["Bytes"]>;
  verifiedCaller?: Maybe<Scalars["Bytes"]>;
  verifiedTimestamp?: Maybe<Scalars["BigInt"]>;
  verifiedTxHash?: Maybe<Scalars["Bytes"]>;
};

export type Verification_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Verification_Filter>>>;
  claim?: InputMaybe<Scalars["String"]>;
  claim_?: InputMaybe<Claim_Filter>;
  claim_contains?: InputMaybe<Scalars["String"]>;
  claim_contains_nocase?: InputMaybe<Scalars["String"]>;
  claim_ends_with?: InputMaybe<Scalars["String"]>;
  claim_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  claim_gt?: InputMaybe<Scalars["String"]>;
  claim_gte?: InputMaybe<Scalars["String"]>;
  claim_in?: InputMaybe<Array<Scalars["String"]>>;
  claim_lt?: InputMaybe<Scalars["String"]>;
  claim_lte?: InputMaybe<Scalars["String"]>;
  claim_not?: InputMaybe<Scalars["String"]>;
  claim_not_contains?: InputMaybe<Scalars["String"]>;
  claim_not_contains_nocase?: InputMaybe<Scalars["String"]>;
  claim_not_ends_with?: InputMaybe<Scalars["String"]>;
  claim_not_ends_with_nocase?: InputMaybe<Scalars["String"]>;
  claim_not_in?: InputMaybe<Array<Scalars["String"]>>;
  claim_not_starts_with?: InputMaybe<Scalars["String"]>;
  claim_not_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  claim_starts_with?: InputMaybe<Scalars["String"]>;
  claim_starts_with_nocase?: InputMaybe<Scalars["String"]>;
  id?: InputMaybe<Scalars["ID"]>;
  id_gt?: InputMaybe<Scalars["ID"]>;
  id_gte?: InputMaybe<Scalars["ID"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]>>;
  id_lt?: InputMaybe<Scalars["ID"]>;
  id_lte?: InputMaybe<Scalars["ID"]>;
  id_not?: InputMaybe<Scalars["ID"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]>>;
  or?: InputMaybe<Array<InputMaybe<Verification_Filter>>>;
  startCaller?: InputMaybe<Scalars["Bytes"]>;
  startCaller_contains?: InputMaybe<Scalars["Bytes"]>;
  startCaller_gt?: InputMaybe<Scalars["Bytes"]>;
  startCaller_gte?: InputMaybe<Scalars["Bytes"]>;
  startCaller_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  startCaller_lt?: InputMaybe<Scalars["Bytes"]>;
  startCaller_lte?: InputMaybe<Scalars["Bytes"]>;
  startCaller_not?: InputMaybe<Scalars["Bytes"]>;
  startCaller_not_contains?: InputMaybe<Scalars["Bytes"]>;
  startCaller_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  startTimestamp?: InputMaybe<Scalars["BigInt"]>;
  startTimestamp_gt?: InputMaybe<Scalars["BigInt"]>;
  startTimestamp_gte?: InputMaybe<Scalars["BigInt"]>;
  startTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  startTimestamp_lt?: InputMaybe<Scalars["BigInt"]>;
  startTimestamp_lte?: InputMaybe<Scalars["BigInt"]>;
  startTimestamp_not?: InputMaybe<Scalars["BigInt"]>;
  startTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  startTxHash?: InputMaybe<Scalars["Bytes"]>;
  startTxHash_contains?: InputMaybe<Scalars["Bytes"]>;
  startTxHash_gt?: InputMaybe<Scalars["Bytes"]>;
  startTxHash_gte?: InputMaybe<Scalars["Bytes"]>;
  startTxHash_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  startTxHash_lt?: InputMaybe<Scalars["Bytes"]>;
  startTxHash_lte?: InputMaybe<Scalars["Bytes"]>;
  startTxHash_not?: InputMaybe<Scalars["Bytes"]>;
  startTxHash_not_contains?: InputMaybe<Scalars["Bytes"]>;
  startTxHash_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  verifiedCaller?: InputMaybe<Scalars["Bytes"]>;
  verifiedCaller_contains?: InputMaybe<Scalars["Bytes"]>;
  verifiedCaller_gt?: InputMaybe<Scalars["Bytes"]>;
  verifiedCaller_gte?: InputMaybe<Scalars["Bytes"]>;
  verifiedCaller_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  verifiedCaller_lt?: InputMaybe<Scalars["Bytes"]>;
  verifiedCaller_lte?: InputMaybe<Scalars["Bytes"]>;
  verifiedCaller_not?: InputMaybe<Scalars["Bytes"]>;
  verifiedCaller_not_contains?: InputMaybe<Scalars["Bytes"]>;
  verifiedCaller_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  verifiedTimestamp?: InputMaybe<Scalars["BigInt"]>;
  verifiedTimestamp_gt?: InputMaybe<Scalars["BigInt"]>;
  verifiedTimestamp_gte?: InputMaybe<Scalars["BigInt"]>;
  verifiedTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  verifiedTimestamp_lt?: InputMaybe<Scalars["BigInt"]>;
  verifiedTimestamp_lte?: InputMaybe<Scalars["BigInt"]>;
  verifiedTimestamp_not?: InputMaybe<Scalars["BigInt"]>;
  verifiedTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]>>;
  verifiedTxHash?: InputMaybe<Scalars["Bytes"]>;
  verifiedTxHash_contains?: InputMaybe<Scalars["Bytes"]>;
  verifiedTxHash_gt?: InputMaybe<Scalars["Bytes"]>;
  verifiedTxHash_gte?: InputMaybe<Scalars["Bytes"]>;
  verifiedTxHash_in?: InputMaybe<Array<Scalars["Bytes"]>>;
  verifiedTxHash_lt?: InputMaybe<Scalars["Bytes"]>;
  verifiedTxHash_lte?: InputMaybe<Scalars["Bytes"]>;
  verifiedTxHash_not?: InputMaybe<Scalars["Bytes"]>;
  verifiedTxHash_not_contains?: InputMaybe<Scalars["Bytes"]>;
  verifiedTxHash_not_in?: InputMaybe<Array<Scalars["Bytes"]>>;
};

export enum Verification_OrderBy {
  Claim = "claim",
  ClaimBridger = "claim__bridger",
  ClaimChallenged = "claim__challenged",
  ClaimEpoch = "claim__epoch",
  ClaimHonest = "claim__honest",
  ClaimId = "claim__id",
  ClaimStateroot = "claim__stateroot",
  ClaimTimestamp = "claim__timestamp",
  ClaimTxHash = "claim__txHash",
  ClaimVerified = "claim__verified",
  Id = "id",
  StartCaller = "startCaller",
  StartTimestamp = "startTimestamp",
  StartTxHash = "startTxHash",
  VerifiedCaller = "verifiedCaller",
  VerifiedTimestamp = "verifiedTimestamp",
  VerifiedTxHash = "verifiedTxHash",
}

export type _Block_ = {
  __typename?: "_Block_";
  /** The hash of the block */
  hash?: Maybe<Scalars["Bytes"]>;
  /** The block number */
  number: Scalars["Int"];
  /** The hash of the parent block */
  parentHash?: Maybe<Scalars["Bytes"]>;
  /** Integer representation of the timestamp stored in blocks for the chain */
  timestamp?: Maybe<Scalars["Int"]>;
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
  deployment: Scalars["String"];
  /** If `true`, the subgraph encountered indexing errors at some past block */
  hasIndexingErrors: Scalars["Boolean"];
};

export enum _SubgraphErrorPolicy_ {
  /** Data will be returned even if the subgraph has indexing errors */
  Allow = "allow",
  /** If the subgraph has indexing errors, data will be omitted. The default. */
  Deny = "deny",
}

export type GetSnapshotQueryVariables = Exact<{
  epoch: Scalars["BigInt"];
  contract: Scalars["String"];
}>;

export type GetSnapshotQuery = {
  __typename?: "Query";
  snapshots: Array<{
    __typename?: "Snapshot";
    id: string;
    epoch?: any | null;
    caller?: any | null;
    txHash?: any | null;
    timestamp?: any | null;
    stateRoot?: any | null;
    numberMessages: any;
    saved: boolean;
    resolving: boolean;
    fallback: Array<{
      __typename?: "Fallback";
      executor: any;
      timestamp?: any | null;
      txHash: any;
      ticketId: any;
    }>;
  }>;
};

export type GetSnapshotsQueryVariables = Exact<{
  snapshotsPerPage?: InputMaybe<Scalars["Int"]>;
  lastTimestamp: Scalars["BigInt"];
  contract: Scalars["String"];
}>;

export type GetSnapshotsQuery = {
  __typename?: "Query";
  snapshots: Array<{
    __typename?: "Snapshot";
    id: string;
    epoch?: any | null;
    caller?: any | null;
    txHash?: any | null;
    timestamp?: any | null;
    stateRoot?: any | null;
    numberMessages: any;
    saved: boolean;
    resolving: boolean;
    fallback: Array<{
      __typename?: "Fallback";
      executor: any;
      timestamp?: any | null;
      txHash: any;
      ticketId: any;
    }>;
  }>;
  ref?: { __typename?: "Ref"; currentSnapshotIndex: any } | null;
};

export type GetResolvingSnapshotsQueryVariables = Exact<{
  snapshotsPerPage?: InputMaybe<Scalars["Int"]>;
  lastTimestamp: Scalars["BigInt"];
  resolving?: InputMaybe<Scalars["Boolean"]>;
  contract: Scalars["String"];
}>;

export type GetResolvingSnapshotsQuery = {
  __typename?: "Query";
  snapshots: Array<{
    __typename?: "Snapshot";
    id: string;
    epoch?: any | null;
    caller?: any | null;
    txHash?: any | null;
    timestamp?: any | null;
    stateRoot?: any | null;
    numberMessages: any;
    saved: boolean;
    resolving: boolean;
    fallback: Array<{
      __typename?: "Fallback";
      executor: any;
      timestamp?: any | null;
      txHash: any;
      ticketId: any;
    }>;
  }>;
  ref?: { __typename?: "Ref"; currentSnapshotIndex: any } | null;
};

export type SearchSnapshotsQueryVariables = Exact<{
  snapshotsPerPage?: InputMaybe<Scalars["Int"]>;
  value: Scalars["String"];
  contract: Scalars["String"];
}>;

export type SearchSnapshotsQuery = {
  __typename?: "Query";
  snapshotQuery: Array<{
    __typename?: "Snapshot";
    id: string;
    epoch?: any | null;
    caller?: any | null;
    txHash?: any | null;
    timestamp?: any | null;
    stateRoot?: any | null;
    numberMessages: any;
    saved: boolean;
    resolving: boolean;
    fallback: Array<{
      __typename?: "Fallback";
      executor: any;
      timestamp?: any | null;
      txHash: any;
      ticketId: any;
    }>;
  }>;
};

export type GetMessagesQueryVariables = Exact<{
  skip: Scalars["Int"];
  snapshot: Scalars["String"];
  snapshotID: Scalars["ID"];
}>;

export type GetMessagesQuery = {
  __typename?: "Query";
  messages: Array<{
    __typename?: "Message";
    id: string;
    txHash: any;
    timestamp: any;
    from: any;
    to: any;
    data: any;
  }>;
  snapshot?: { __typename?: "Snapshot"; numberMessages: any } | null;
};

export type GetClaimQueryVariables = Exact<{
  epoch: Scalars["BigInt"];
  contract: Scalars["String"];
}>;

export type GetClaimQuery = {
  __typename?: "Query";
  claims: Array<{
    __typename?: "Claim";
    id: string;
    epoch: any;
    timestamp: any;
    stateroot: any;
    bridger: any;
    challenged: boolean;
    verified: boolean;
    txHash: any;
    challenge?: {
      __typename?: "Challenge";
      id: string;
      timestamp: any;
      challenger: any;
      honest: boolean;
      txHash: any;
    } | null;
    verification?: {
      __typename?: "Verification";
      verifiedTimestamp?: any | null;
      verifiedCaller?: any | null;
      verifiedTxHash?: any | null;
    } | null;
  }>;
};

export type GetClaimedSnapshotsQueryVariables = Exact<{
  snapshotsPerPage?: InputMaybe<Scalars["Int"]>;
  lastTimestamp: Scalars["BigInt"];
  contract: Scalars["String"];
}>;

export type GetClaimedSnapshotsQuery = {
  __typename?: "Query";
  claims: Array<{
    __typename?: "Claim";
    id: string;
    epoch: any;
    timestamp: any;
    stateroot: any;
    bridger: any;
    challenged: boolean;
    verified: boolean;
    txHash: any;
    challenge?: {
      __typename?: "Challenge";
      id: string;
      timestamp: any;
      challenger: any;
      honest: boolean;
      txHash: any;
    } | null;
    verification?: {
      __typename?: "Verification";
      verifiedTimestamp?: any | null;
      verifiedCaller?: any | null;
      verifiedTxHash?: any | null;
    } | null;
  }>;
};

export type GetChallengedSnapshotsQueryVariables = Exact<{
  snapshotsPerPage?: InputMaybe<Scalars["Int"]>;
  lastTimestamp: Scalars["BigInt"];
  contract: Scalars["String"];
}>;

export type GetChallengedSnapshotsQuery = {
  __typename?: "Query";
  claims: Array<{
    __typename?: "Claim";
    id: string;
    epoch: any;
    timestamp: any;
    stateroot: any;
    bridger: any;
    challenged: boolean;
    verified: boolean;
    txHash: any;
    challenge?: {
      __typename?: "Challenge";
      id: string;
      timestamp: any;
      challenger: any;
      honest: boolean;
      txHash: any;
    } | null;
    verification?: {
      __typename?: "Verification";
      verifiedTimestamp?: any | null;
      verifiedCaller?: any | null;
      verifiedTxHash?: any | null;
    } | null;
  }>;
};

export type GetVerifiedSnapshotsQueryVariables = Exact<{
  snapshotsPerPage?: InputMaybe<Scalars["Int"]>;
  lastTimestamp: Scalars["BigInt"];
  contract: Scalars["String"];
}>;

export type GetVerifiedSnapshotsQuery = {
  __typename?: "Query";
  claims: Array<{
    __typename?: "Claim";
    id: string;
    epoch: any;
    timestamp: any;
    stateroot: any;
    bridger: any;
    challenged: boolean;
    verified: boolean;
    txHash: any;
    challenge?: {
      __typename?: "Challenge";
      id: string;
      timestamp: any;
      challenger: any;
      honest: boolean;
      txHash: any;
    } | null;
    verification?: {
      __typename?: "Verification";
      verifiedTimestamp?: any | null;
      verifiedCaller?: any | null;
      verifiedTxHash?: any | null;
    } | null;
  }>;
};

export type GetResolvedSnapshotsQueryVariables = Exact<{
  snapshotsPerPage?: InputMaybe<Scalars["Int"]>;
  lastTimestamp: Scalars["BigInt"];
  contract: Scalars["String"];
}>;

export type GetResolvedSnapshotsQuery = {
  __typename?: "Query";
  claims: Array<{
    __typename?: "Claim";
    id: string;
    epoch: any;
    timestamp: any;
    stateroot: any;
    bridger: any;
    challenged: boolean;
    verified: boolean;
    txHash: any;
    challenge?: {
      __typename?: "Challenge";
      id: string;
      timestamp: any;
      challenger: any;
      honest: boolean;
      txHash: any;
    } | null;
    verification?: {
      __typename?: "Verification";
      verifiedTimestamp?: any | null;
      verifiedCaller?: any | null;
      verifiedTxHash?: any | null;
    } | null;
  }>;
};

export type GetRelayQueryVariables = Exact<{
  id: Scalars["ID"];
}>;

export type GetRelayQuery = {
  __typename?: "Query";
  message?: {
    __typename?: "Message";
    timestamp: any;
    txHash: any;
    relayer: any;
    proof: any;
  } | null;
};

export const GetSnapshotDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getSnapshot" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "epoch" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "BigInt" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "contract" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "snapshots" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "epoch" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "epoch" },
                      },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "inbox" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "contract" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "epoch" } },
                { kind: "Field", name: { kind: "Name", value: "caller" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "stateRoot" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "numberMessages" },
                },
                { kind: "Field", name: { kind: "Name", value: "saved" } },
                { kind: "Field", name: { kind: "Name", value: "resolving" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "fallback" },
                  arguments: [
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "first" },
                      value: { kind: "IntValue", value: "1" },
                    },
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "orderBy" },
                      value: { kind: "EnumValue", value: "timestamp" },
                    },
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "orderDirection" },
                      value: { kind: "EnumValue", value: "desc" },
                    },
                  ],
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "executor" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "timestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "txHash" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "ticketId" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetSnapshotQuery, GetSnapshotQueryVariables>;
export const GetSnapshotsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getSnapshots" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "snapshotsPerPage" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "lastTimestamp" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "BigInt" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "contract" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "snapshots" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "snapshotsPerPage" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderBy" },
                value: { kind: "EnumValue", value: "timestamp" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderDirection" },
                value: { kind: "EnumValue", value: "desc" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "timestamp_lte" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "lastTimestamp" },
                      },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "inbox" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "contract" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "epoch" } },
                { kind: "Field", name: { kind: "Name", value: "caller" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "stateRoot" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "numberMessages" },
                },
                { kind: "Field", name: { kind: "Name", value: "saved" } },
                { kind: "Field", name: { kind: "Name", value: "resolving" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "fallback" },
                  arguments: [
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "first" },
                      value: { kind: "IntValue", value: "1" },
                    },
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "orderBy" },
                      value: { kind: "EnumValue", value: "timestamp" },
                    },
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "orderDirection" },
                      value: { kind: "EnumValue", value: "desc" },
                    },
                  ],
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "executor" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "timestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "txHash" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "ticketId" },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "ref" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "StringValue", value: "0", block: false },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "currentSnapshotIndex" },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetSnapshotsQuery, GetSnapshotsQueryVariables>;
export const GetResolvingSnapshotsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getResolvingSnapshots" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "snapshotsPerPage" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "lastTimestamp" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "BigInt" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "resolving" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "Boolean" } },
          defaultValue: { kind: "BooleanValue", value: true },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "contract" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "snapshots" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "snapshotsPerPage" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderBy" },
                value: { kind: "EnumValue", value: "timestamp" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderDirection" },
                value: { kind: "EnumValue", value: "desc" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "timestamp_lte" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "lastTimestamp" },
                      },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "resolving" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "resolving" },
                      },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "inbox" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "contract" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "epoch" } },
                { kind: "Field", name: { kind: "Name", value: "caller" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "stateRoot" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "numberMessages" },
                },
                { kind: "Field", name: { kind: "Name", value: "saved" } },
                { kind: "Field", name: { kind: "Name", value: "resolving" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "fallback" },
                  arguments: [
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "first" },
                      value: { kind: "IntValue", value: "1" },
                    },
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "orderBy" },
                      value: { kind: "EnumValue", value: "timestamp" },
                    },
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "orderDirection" },
                      value: { kind: "EnumValue", value: "desc" },
                    },
                  ],
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "executor" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "timestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "txHash" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "ticketId" },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "ref" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "StringValue", value: "0", block: false },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "currentSnapshotIndex" },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetResolvingSnapshotsQuery,
  GetResolvingSnapshotsQueryVariables
>;
export const SearchSnapshotsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "searchSnapshots" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "snapshotsPerPage" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "value" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "contract" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "snapshotQuery" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "text" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "value" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "snapshotsPerPage" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "inbox" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "contract" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "epoch" } },
                { kind: "Field", name: { kind: "Name", value: "caller" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "stateRoot" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "numberMessages" },
                },
                { kind: "Field", name: { kind: "Name", value: "saved" } },
                { kind: "Field", name: { kind: "Name", value: "resolving" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "fallback" },
                  arguments: [
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "first" },
                      value: { kind: "IntValue", value: "1" },
                    },
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "orderBy" },
                      value: { kind: "EnumValue", value: "timestamp" },
                    },
                    {
                      kind: "Argument",
                      name: { kind: "Name", value: "orderDirection" },
                      value: { kind: "EnumValue", value: "desc" },
                    },
                  ],
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "executor" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "timestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "txHash" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "ticketId" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SearchSnapshotsQuery,
  SearchSnapshotsQueryVariables
>;
export const GetMessagesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getMessages" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "skip" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "snapshot" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "snapshotID" },
          },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "messages" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: { kind: "IntValue", value: "5" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "skip" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "skip" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderBy" },
                value: { kind: "EnumValue", value: "timestamp" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderDirection" },
                value: { kind: "EnumValue", value: "desc" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "snapshot" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "snapshot" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "from" } },
                { kind: "Field", name: { kind: "Name", value: "to" } },
                { kind: "Field", name: { kind: "Name", value: "data" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "snapshot" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "snapshotID" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "numberMessages" },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetMessagesQuery, GetMessagesQueryVariables>;
export const GetClaimDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getClaim" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "epoch" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "BigInt" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "contract" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "claims" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "epoch" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "epoch" },
                      },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "outbox" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "contract" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "epoch" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "stateroot" } },
                { kind: "Field", name: { kind: "Name", value: "bridger" } },
                { kind: "Field", name: { kind: "Name", value: "challenged" } },
                { kind: "Field", name: { kind: "Name", value: "verified" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "challenge" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "timestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "challenger" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "honest" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "txHash" },
                      },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "verification" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTimestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedCaller" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTxHash" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetClaimQuery, GetClaimQueryVariables>;
export const GetClaimedSnapshotsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getClaimedSnapshots" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "snapshotsPerPage" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "lastTimestamp" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "BigInt" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "contract" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "claims" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "snapshotsPerPage" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderBy" },
                value: { kind: "EnumValue", value: "timestamp" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderDirection" },
                value: { kind: "EnumValue", value: "desc" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "timestamp_lte" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "lastTimestamp" },
                      },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "verified" },
                      value: { kind: "BooleanValue", value: false },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "challenged" },
                      value: { kind: "BooleanValue", value: false },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "outbox" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "contract" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "epoch" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "stateroot" } },
                { kind: "Field", name: { kind: "Name", value: "bridger" } },
                { kind: "Field", name: { kind: "Name", value: "challenged" } },
                { kind: "Field", name: { kind: "Name", value: "verified" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "challenge" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "timestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "challenger" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "honest" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "txHash" },
                      },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "verification" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTimestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedCaller" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTxHash" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetClaimedSnapshotsQuery,
  GetClaimedSnapshotsQueryVariables
>;
export const GetChallengedSnapshotsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getChallengedSnapshots" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "snapshotsPerPage" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "lastTimestamp" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "BigInt" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "contract" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "claims" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "snapshotsPerPage" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderBy" },
                value: { kind: "EnumValue", value: "timestamp" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderDirection" },
                value: { kind: "EnumValue", value: "desc" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "timestamp_lte" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "lastTimestamp" },
                      },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "verified" },
                      value: { kind: "BooleanValue", value: false },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "challenged" },
                      value: { kind: "BooleanValue", value: true },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "outbox" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "contract" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "epoch" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "stateroot" } },
                { kind: "Field", name: { kind: "Name", value: "bridger" } },
                { kind: "Field", name: { kind: "Name", value: "challenged" } },
                { kind: "Field", name: { kind: "Name", value: "verified" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "challenge" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "timestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "challenger" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "honest" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "txHash" },
                      },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "verification" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTimestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedCaller" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTxHash" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetChallengedSnapshotsQuery,
  GetChallengedSnapshotsQueryVariables
>;
export const GetVerifiedSnapshotsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getVerifiedSnapshots" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "snapshotsPerPage" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "lastTimestamp" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "BigInt" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "contract" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "claims" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "snapshotsPerPage" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderBy" },
                value: { kind: "EnumValue", value: "timestamp" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderDirection" },
                value: { kind: "EnumValue", value: "desc" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "timestamp_lte" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "lastTimestamp" },
                      },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "verified" },
                      value: { kind: "BooleanValue", value: true },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "challenged" },
                      value: { kind: "BooleanValue", value: false },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "outbox" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "contract" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "epoch" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "stateroot" } },
                { kind: "Field", name: { kind: "Name", value: "bridger" } },
                { kind: "Field", name: { kind: "Name", value: "challenged" } },
                { kind: "Field", name: { kind: "Name", value: "verified" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "challenge" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "timestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "challenger" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "honest" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "txHash" },
                      },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "verification" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTimestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedCaller" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTxHash" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetVerifiedSnapshotsQuery,
  GetVerifiedSnapshotsQueryVariables
>;
export const GetResolvedSnapshotsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getResolvedSnapshots" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "snapshotsPerPage" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "lastTimestamp" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "BigInt" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "contract" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "claims" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "snapshotsPerPage" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderBy" },
                value: { kind: "EnumValue", value: "timestamp" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderDirection" },
                value: { kind: "EnumValue", value: "desc" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "where" },
                value: {
                  kind: "ObjectValue",
                  fields: [
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "timestamp_lte" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "lastTimestamp" },
                      },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "verified" },
                      value: { kind: "BooleanValue", value: true },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "challenged" },
                      value: { kind: "BooleanValue", value: true },
                    },
                    {
                      kind: "ObjectField",
                      name: { kind: "Name", value: "outbox" },
                      value: {
                        kind: "Variable",
                        name: { kind: "Name", value: "contract" },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "epoch" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "stateroot" } },
                { kind: "Field", name: { kind: "Name", value: "bridger" } },
                { kind: "Field", name: { kind: "Name", value: "challenged" } },
                { kind: "Field", name: { kind: "Name", value: "verified" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "challenge" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "timestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "challenger" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "honest" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "txHash" },
                      },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "verification" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTimestamp" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedCaller" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "verifiedTxHash" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetResolvedSnapshotsQuery,
  GetResolvedSnapshotsQueryVariables
>;
export const GetRelayDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "getRelay" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "message" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "id" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "txHash" } },
                { kind: "Field", name: { kind: "Name", value: "relayer" } },
                { kind: "Field", name: { kind: "Name", value: "proof" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetRelayQuery, GetRelayQueryVariables>;
