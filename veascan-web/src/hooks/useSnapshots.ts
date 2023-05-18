import useSWR from "swr";
import { BigNumber } from "ethers";
import { bridges } from "consts/bridges";
import { getClaimQuery } from "queries/getClaim";
import { getSnapshotsQuery } from "queries/getSnapshots";
import { GetClaimQuery, GetSnapshotsQuery } from "src/gql/graphql";
import { useFiltersContext } from "contexts/FiltersContext";
import { request } from "../../../node_modules/graphql-request/build/cjs/index";

export type InboxData = GetSnapshotsQuery["snapshots"][number] & {
  bridgeIndex: number;
};

export type OutboxData = GetClaimQuery["claims"][number];

interface IUseSnapshots {
  snapshots: [InboxData, OutboxData][];
  totalSnapshots: BigNumber;
}

export const useSnapshots = (
  shownSnapshots = new Set<string>(),
  lastTimestamp = "99999999999999",
  snapshotsPerPage = 5
) => {
  const { fromChain, toChain } = useFiltersContext();
  return useSWR(
    `${fromChain}-${toChain}-${lastTimestamp}`,
    async (): Promise<IUseSnapshots> => {
      const { sortedSnapshots, totalSnapshots } = await getSortedSnapshots(
        lastTimestamp,
        fromChain,
        toChain,
        snapshotsPerPage + 1
      );
      const filteredSnapshots = sortedSnapshots.filter(
        (snapshot) => !shownSnapshots.has(getSnapshotId(snapshot))
      );
      const pageSnapshots = filteredSnapshots.slice(0, snapshotsPerPage);
      return {
        snapshots: await Promise.all(
          pageSnapshots.map(async (snapshot) => {
            const claim = await request(
              bridges[snapshot.bridgeIndex].outboxEndpoint,
              getClaimQuery,
              {
                epoch: snapshot.epoch.toString(),
              }
            ).then((result) => result.claims[0]);
            return [snapshot, claim];
          })
        ),
        totalSnapshots,
      };
    }
  );
};

const getSortedSnapshots = async (
  lastTimestamp: string,
  from: number,
  to: number,
  snapshotsPerPage: number
) => {
  const filteredBridges = bridges.filter((bridge) => {
    if (from > 0 && bridge.from !== from) return false;
    if (to > 0 && bridge.to !== to) return false;
    return true;
  });
  const queryQueue = filteredBridges.map((bridge) =>
    request(bridge.inboxEndpoint, getSnapshotsQuery, {
      lastTimestamp,
      snapshotsPerPage,
    })
  );
  const queryResults = await Promise.all(queryQueue);
  const snapshotsWithBridgeIndex = queryResults
    .map((queryResult, bridgeIndex) =>
      queryResult.snapshots.map((snapshot) => ({ ...snapshot, bridgeIndex }))
    )
    .flat();
  return {
    sortedSnapshots: snapshotsWithBridgeIndex.sort(
      (a, b) => parseInt(b.timestamp) - parseInt(a.timestamp)
    ),
    totalSnapshots: queryResults.reduce(
      (acc, { ref }) => acc.add(ref?.currentSnapshotIndex),
      BigNumber.from(0)
    ),
  };
};

export const getSnapshotId = ({ bridgeIndex, epoch }: InboxData) =>
  `${bridgeIndex.toString() + epoch}`;
