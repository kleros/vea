import { useState } from "react";
import useSWR from "swr";
import { request } from "../../../node_modules/graphql-request/build/cjs/index";
import { bridges } from "consts/bridges";
import { getSnapshotsQuery } from "./queries/getSnapshots";
import { getClaimQuery } from "./queries/getClaim";
import { GetSnapshotsQuery } from "src/gql/graphql";

export const useSnapshots = (lastTimestamp: string) => {
  const [currentTimestamp, setCurrentTimestamp] = useState<string>();
  const [currentSnapshots, setCurrentSnapshots] = useState<Set<string>>();
  return useSWR("all", async () => {
    const sortedSnapshots = await getSortedSnapshots(lastTimestamp);
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
          { epoch: snapshot.epoch.toString() }
        ).then((result) => result.claims[0]);
        return [snapshot, claim];
      })
    );
  });
};

const getSortedSnapshots = async (lastTimestamp: string) => {
  const queryQueue = bridges.map((bridge) =>
    request(bridge.inboxEndpoint, getSnapshotsQuery, { lastTimestamp })
  );
  const queryResults = await Promise.all(queryQueue);
  const snapshotsWithBridgeIndex = queryResults
    .map((queryResult, bridgeIndex) =>
      queryResult.snapshots.map((snapshot) => ({ ...snapshot, bridgeIndex }))
    )
    .flat();
  return snapshotsWithBridgeIndex.sort(
    (a, b) => parseInt(a.timestamp) - parseInt(b.timestamp)
  );
};

const getSnapshotId = ({
  bridgeIndex,
  epoch,
}: GetSnapshotsQuery["snapshots"][number] & { bridgeIndex: number }) =>
  `${bridgeIndex.toString() + epoch}`;
