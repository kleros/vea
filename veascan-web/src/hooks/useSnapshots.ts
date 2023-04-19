import useSWR from "swr";
import { request } from "../../../node_modules/graphql-request/build/cjs/index";
import { bridges } from "consts/bridges";
import { getSnapshotsQuery } from "./queries/getSnapshots";
import { getClaimQuery } from "./queries/getClaim";

export const useSnapshots = (lastTimestamp: string) => {
  return useSWR("all", async () => {
    const snapshots = bridges.map((bridge) =>
      request(bridge.inboxEndpoint, getSnapshotsQuery, { lastTimestamp })
    );
    const snapshotQueryResult = await Promise.all(snapshots);
    const snapshotsWithBridgeIndex = snapshotQueryResult
      .map((result, bridgeIndex) =>
        result.snapshots.map((snapshot) => ({ ...snapshot, bridgeIndex }))
      )
      .flat();
    const orderedSnapshots = snapshotsWithBridgeIndex.sort(
      (a, b) => parseInt(a.timestamp) - parseInt(b.timestamp)
    );
    return Promise.all(
      orderedSnapshots.slice(0, 6).map(async (snapshot) => {
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
