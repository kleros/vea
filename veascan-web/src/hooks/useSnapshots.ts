import useSWR from "swr";
import { bridges, getBridge } from "consts/bridges";
import {
  GetClaimedSnapshotsQuery,
  GetClaimQuery,
  GetSnapshotQuery,
  GetSnapshotsQuery,
} from "src/gql/graphql";
import {
  useFiltersContext,
  IQueries,
  ORDER,
  isInboxQuery,
} from "contexts/FiltersContext";
import { request } from "../../../node_modules/graphql-request/build/cjs/index";
import { getSnapshotQuery } from "./queries/getInboxData";
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
  const { fromChain, toChain, queryInfo, statusFilter } = useFiltersContext();
  return useSWR(
    `${fromChain}-${toChain}-${lastTimestamp}-${statusFilter}`,
    async (): Promise<IUseSnapshots> => {
      const { sortedSnapshots } = await getSortedSnapshots(
        lastTimestamp,
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
            getSecondaryData(snapshot, queryInfo.order)
          )
        )) as [InboxData, OutboxData][],
        isMorePages: filteredSnapshots.length > snapshotsPerPage,
      };
    }
  );
};

const getSortedSnapshots = async (
  lastTimestamp: string,
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
      isInboxQuery(query) ? bridge.inboxEndpoint : bridge.outboxEndpoint,
      query,
      {
        lastTimestamp,
        snapshotsPerPage: snapshotsPerPage + 1,
      }
    ).then((queryResult) => {
      const snapshots = isInboxQuery(query)
        ? (queryResult as GetSnapshotsQuery).snapshots
        : (queryResult as GetClaimedSnapshotsQuery).claims;
      return snapshots.map((snapshot) => ({
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

const getSecondaryData = async (
  snapshot: InboxData | (OutboxData & { bridgeId: number }),
  order: ORDER
) => {
  const isFirstInbox = order === ORDER.firstInbox;
  const secondaryData = await request(
    isFirstInbox
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
