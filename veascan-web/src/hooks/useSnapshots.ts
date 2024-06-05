import useSWR from "swr";
import { bridges, getBridge, IBridge } from "consts/bridges";
import {
  GetClaimedSnapshotsQuery,
  GetClaimQuery,
  GetSnapshotQuery,
  GetSnapshotsQuery,
  SearchSnapshotsQuery,
} from "src/gql/graphql";
import {
  useFiltersContext,
  IQueries,
  ORDER,
  isInboxQuery,
} from "contexts/FiltersContext";
import { request } from "../../../node_modules/graphql-request/build/cjs/index";
import { getSnapshotQuery, searchSnapshotsQuery } from "./queries/getInboxData";
import { getClaimQuery } from "./queries/getOutboxData";

export type InboxData = GetSnapshotsQuery["snapshots"][number] & {
  bridgeId: number;
};

export type OutboxData = GetClaimQuery["claims"][number];

interface IUseSnapshots {
  snapshots: [InboxData, OutboxData][];
  isMorePages: boolean;
}

export const useSnapshots = (
  shownSnapshots = new Set<string>(),
  lastTimestamp = "99999999999999",
  snapshotsPerPage = 5
) => {
  const { debouncedSearch, fromChain, toChain, queryInfo, statusFilter } =
    useFiltersContext();
  return useSWR(
    `${fromChain}${toChain}${lastTimestamp}${statusFilter}${debouncedSearch}`,
    async (): Promise<IUseSnapshots> => {
      const { sortedSnapshots } = await getSortedSnapshots(
        lastTimestamp,
        debouncedSearch,
        fromChain,
        toChain,
        snapshotsPerPage,
        queryInfo.query
      );
      const filteredSnapshots = sortedSnapshots.filter(
        (snapshot) => !shownSnapshots.has(getSnapshotId(snapshot))
      );
      const pageSnapshots = filteredSnapshots.slice(0, snapshotsPerPage);
      return {
        snapshots: (await Promise.all(
          pageSnapshots.map((snapshot) =>
            getSecondaryData(snapshot, debouncedSearch, queryInfo.order)
          )
        )) as [InboxData, OutboxData][],
        isMorePages: filteredSnapshots.length > snapshotsPerPage,
      };
    }
  );
};

const getSortedSnapshots = async (
  lastTimestamp: string,
  debouncedSearch: string,
  from: number,
  to: number,
  snapshotsPerPage: number,
  query: IQueries
) => {
  const filteredBridges = bridges.filter((bridge) => {
    if (from > 0 && bridge.from !== from) return false;
    if (to > 0 && bridge.to !== to) return false;
    return true;
  });
  const queryQueue = filteredBridges.map((bridge) =>
    request(
      getEndpoint(query, bridge, debouncedSearch),
      getQueryDocument(query, debouncedSearch),
      {
        lastTimestamp,
        snapshotsPerPage: snapshotsPerPage + 1,
        value: debouncedSearch,
      }
    ).then((queryResult) => {
      const getSnapshots = () => {
        if (debouncedSearch)
          return (queryResult as SearchSnapshotsQuery).snapshotQuery;
        else if (isInboxQuery(query))
          return (queryResult as GetSnapshotsQuery).snapshots;
        else {
          return (queryResult as GetClaimedSnapshotsQuery).claims;
        }
      };
      return getSnapshots().map((snapshot) => ({
        ...snapshot,
        bridgeId: bridge.id,
      }));
    })
  );
  const snapshotsWithBridgeId = await Promise.all(queryQueue).then((result) =>
    result.flat()
  );
  return {
    sortedSnapshots: snapshotsWithBridgeId.sort(
      (a, b) => parseInt(b.timestamp) - parseInt(a.timestamp)
    ),
  };
};

const getEndpoint = (
  query: IQueries,
  bridge: IBridge,
  debouncedSearch: string
) =>
  isInboxQuery(query) || debouncedSearch
    ? bridge.inboxEndpoint
    : bridge.outboxEndpoint;

const getQueryDocument = (query: IQueries, debouncedSearch: string) =>
  debouncedSearch ? searchSnapshotsQuery : query;

const getSecondaryData = async (
  snapshot: InboxData | (OutboxData & { bridgeId: number }),
  debouncedSearch: string,
  order: ORDER
) => {
  const isFirstInbox = order === ORDER.firstInbox;
  const secondaryData = await request(
    isFirstInbox || debouncedSearch !== ""
      ? getBridge(snapshot.bridgeId).outboxEndpoint
      : getBridge(snapshot.bridgeId).inboxEndpoint,
    isFirstInbox ? getClaimQuery : getSnapshotQuery,
    {
      epoch: snapshot.epoch.toString(),
    }
  ).then((result) =>
    isFirstInbox
      ? (result as unknown as GetClaimQuery).claims[0]
      : (result as GetSnapshotQuery).snapshots[0]
  );
  return isFirstInbox
    ? [snapshot, secondaryData]
    : [{ ...secondaryData, bridgeId: snapshot.bridgeId }, snapshot];
};

export const getSnapshotId = ({
  bridgeId,
  epoch,
}: InboxData | (OutboxData & { bridgeId: number })) =>
  `${bridgeId.toString() + epoch}`;
