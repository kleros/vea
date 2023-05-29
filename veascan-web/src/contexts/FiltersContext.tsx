import React, { useState, createContext, useContext, useMemo } from "react";
import { theme } from "styles/themes";
import { useDebounce } from "react-use";
import {
  getSnapshotsQuery,
  getResolvingSnapshotsQuery,
} from "queries/getInboxData";
import {
  getClaimedSnapshotsQuery,
  getResolvedSnapshotsQuery,
  getVerifiedSnapshotsQuery,
  getChallengedSnapshotsQuery,
} from "queries/getOutboxData";
import { RequestDocument } from "graphql-request";

const InboxQueries: RequestDocument[] = [
  getSnapshotsQuery,
  getResolvingSnapshotsQuery,
];

export type IInboxQueries = (typeof InboxQueries)[number];

export const isInboxQuery = (query: RequestDocument): query is IInboxQueries =>
  InboxQueries.includes(query);

const OutboxQueries: RequestDocument[] = [
  getClaimedSnapshotsQuery,
  getResolvedSnapshotsQuery,
  getVerifiedSnapshotsQuery,
  getChallengedSnapshotsQuery,
];

export type IOutboxQueries = (typeof OutboxQueries)[number];

export const isOutboxQuery = (
  query: RequestDocument
): query is IOutboxQueries => OutboxQueries.includes(query);

export type IQueries = IInboxQueries | IOutboxQueries;

export enum ORDER {
  firstInbox,
  firstOutbox,
}

interface IItem {
  text: string;
  dot: string;
  value: number;
}

interface IQueryInfo {
  order: ORDER;
  query: IQueries;
}

const STATUS_FILTERS: { item: IItem; queryInfo: IQueryInfo }[] = [
  {
    item: { text: "All", dot: theme.color.white, value: 0 },
    queryInfo: {
      order: ORDER.firstInbox,
      query: getSnapshotsQuery,
    },
  },
  {
    item: { text: "Claimed", dot: theme.color.turquoise, value: 1 },
    queryInfo: {
      order: ORDER.firstOutbox,
      query: getClaimedSnapshotsQuery,
    },
  },
  {
    item: { text: "Challenged", dot: theme.color.lightPurple, value: 2 },
    queryInfo: {
      order: ORDER.firstOutbox,
      query: getChallengedSnapshotsQuery,
    },
  },
  {
    item: { text: "Verified", dot: theme.color.darkBlue, value: 3 },
    queryInfo: {
      order: ORDER.firstOutbox,
      query: getVerifiedSnapshotsQuery,
    },
  },
  {
    item: { text: "Resolving", dot: theme.color.teal, value: 4 },
    queryInfo: {
      order: ORDER.firstInbox,
      query: getResolvingSnapshotsQuery,
    },
  },
  {
    item: { text: "Resolved", dot: theme.color.green, value: 5 },
    queryInfo: {
      order: ORDER.firstOutbox,
      query: getResolvedSnapshotsQuery,
    },
  },
];

interface IFilters {
  search: string;
  setSearch: (arg0: string) => void;
  debouncedSearch: string;
  fromChain: number;
  toChain: number;
  statusFilter: number;
  statusItems: IItem[];
  setFromChain: (arg0: number) => void;
  setToChain: (arg0: number) => void;
  setStatusFilter: (arg0: number) => void;
  queryInfo: IQueryInfo;
}

const Context = createContext<IFilters>({
  search: "",
  setSearch: () => {
    //
  },
  debouncedSearch: "",
  fromChain: 0,
  toChain: 0,
  statusFilter: 0,
  setFromChain: () => {
    //
  },
  setToChain: () => {
    //
  },
  setStatusFilter: () => {
    //
  },
  statusItems: [],
  queryInfo: { order: ORDER.firstInbox, query: getSnapshotsQuery },
});

export const FiltersContext: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const [fromChain, setFromChain] = useState(0);
  const [toChain, setToChain] = useState(0);
  const [statusFilter, setStatusFilter] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useDebounce(() => setDebouncedSearch(search), 500, [search]);
  const value = useMemo(
    () => ({
      search,
      setSearch,
      debouncedSearch,
      fromChain,
      toChain,
      setFromChain,
      setToChain,
      statusItems: STATUS_FILTERS.map((filter) => filter.item),
      statusFilter,
      setStatusFilter,
      queryInfo: STATUS_FILTERS.find(
        (filter) => filter.item.value === statusFilter
      )!.queryInfo,
    }),
    [search, debouncedSearch, fromChain, toChain, statusFilter]
  );
  return <Context.Provider {...{ value }}> {children} </Context.Provider>;
};

export const useFiltersContext = () => useContext(Context);
