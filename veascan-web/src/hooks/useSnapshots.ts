import useSWR from "swr";
import { bridges } from "consts/bridges";
import { getClaimQuery } from "queries/getClaim";
import { getSnapshotsQuery } from "queries/getSnapshots";
import { useState } from "react";
import { GetClaimQuery, GetSnapshotsQuery } from "src/gql/graphql";
import { useFiltersContext } from "contexts/FiltersContext";
import { request } from "../../../node_modules/graphql-request/build/cjs/index";

export type InboxData = GetSnapshotsQuery["snapshots"][number] & {
  bridgeIndex: number;
};

export type OutboxData = GetClaimQuery["claims"][number];

export const useSnapshots = (lastTimestamp: string) => {
  const [currentTimestamp, setCurrentTimestamp] = useState<string>();
  const [currentSnapshots, setCurrentSnapshots] = useState<Set<string>>();
  const { fromChain, toChain } = useFiltersContext();
  return useSWR(
    `snapshots-${fromChain}-${toChain}`,
    async (): Promise<[InboxData, OutboxData][]> => {
      const sortedSnapshots = await getSortedSnapshots(
        lastTimestamp,
        fromChain,
        toChain
      );
      const filteredSnapshots = sortedSnapshots.filter(
        (snapshot) =>
          currentTimestamp === lastTimestamp ||
          !currentSnapshots?.has(getSnapshotId(snapshot))
      );
      const pageSnapshots = filteredSnapshots.slice(0, 6);
      setCurrentSnapshots(new Set(pageSnapshots.map(getSnapshotId)));
      setCurrentTimestamp(lastTimestamp);
      return Promise.all(
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
      );
    }
  );
};

const getSortedSnapshots = async (
  lastTimestamp: string,
  from: number,
  to: number
) => {
  const filteredBridges = bridges.filter((bridge) => {
    if (from > 0 && bridge.from !== from) return false;
    if (to > 0 && bridge.to !== to) return false;
    return true;
  });
  const queryQueue = filteredBridges.map((bridge) =>
    request(bridge.inboxEndpoint, getSnapshotsQuery, { lastTimestamp })
  );
  const queryResults = await Promise.all(queryQueue);
  const snapshotsWithBridgeIndex = queryResults
    .map((queryResult, bridgeIndex) =>
      queryResult.snapshots.map((snapshot) => ({ ...snapshot, bridgeIndex }))
    )
    .flat();
  return snapshotsWithBridgeIndex.sort(
    (a, b) => parseInt(b.timestamp) - parseInt(a.timestamp)
  );
};

const getSnapshotId = ({ bridgeIndex, epoch }: InboxData) =>
  `${bridgeIndex.toString() + epoch}`;
