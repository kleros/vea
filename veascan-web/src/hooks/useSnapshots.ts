import useSWR from "swr";
import { bridges, getBridge, IBridge, Network } from "consts/bridges";
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
import { request } from "../../../node_modules/graphql-request/";
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
  lastTimestamp = "9999999999",
  snapshotsPerPage = 5
) => {
  const adjustedTimestamp = (BigInt(lastTimestamp) - BigInt(1)).toString();
  const {
    debouncedSearch,
    fromChain,
    toChain,
    queryInfo,
    statusFilter,
    network,
  } = useFiltersContext();
  return useSWR(
    `${fromChain}${toChain}${lastTimestamp}${statusFilter}${debouncedSearch}${network}`,
    async (): Promise<IUseSnapshots> => {
      const { sortedSnapshots } = await getSortedSnapshots(
        network,
        adjustedTimestamp,
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
      const res = {
        snapshots: (await Promise.all(
          pageSnapshots.map((snapshot) =>
            getSecondaryData(
              network,
              snapshot,
              debouncedSearch,
              queryInfo.order
            )
          )
        )) as [InboxData, OutboxData][],
        isMorePages: filteredSnapshots.length > snapshotsPerPage,
      };
      return res;
    }
  );
};

const getSortedSnapshots = async (
  network: Network,
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
        contract: bridge.contracts[network].veaInbox,
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
) => (isInboxQuery(query) ? bridge.inboxEndpoint : bridge.outboxEndpoint);

const getQueryDocument = (query: IQueries, debouncedSearch: string) =>
  debouncedSearch ? searchSnapshotsQuery : query;

const getSecondaryData = async (
  network: Network,
  snapshot: InboxData | (OutboxData & { bridgeId: number }),
  debouncedSearch: string,
  order: ORDER
) => {
  const isFirstInbox = order === ORDER.firstInbox;
  const bridge = getBridge(snapshot.bridgeId);
  const endpoint =
    debouncedSearch !== ""
      ? bridge.inboxEndpoint
      : isFirstInbox
      ? bridge.outboxEndpoint
      : bridge.inboxEndpoint;
  const secondaryData = await request(
    endpoint,
    isFirstInbox ? getClaimQuery : getSnapshotQuery,
    {
      epoch: snapshot.epoch.toString(),
      contract: isFirstInbox
        ? bridge.contracts[network].veaOutbox
        : bridge.contracts[network].veaInbox,
    }
  ).then((result) =>
    isFirstInbox
      ? (result as unknown as GetClaimQuery).claims[0]
      : (result as unknown as GetSnapshotQuery).snapshots[0]
  );
  const filteredData = isFirstInbox
    ? [snapshot, secondaryData]
    : [{ ...secondaryData, bridgeId: snapshot.bridgeId }, snapshot];
  return filteredData as [InboxData, OutboxData];
};

export const getSnapshotId = ({
  bridgeId,
  epoch,
}: InboxData | (OutboxData & { bridgeId: number })) =>
  `${bridgeId.toString() + epoch}`;
