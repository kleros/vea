import useSWR from "swr";
import { request } from "../../../node_modules/graphql-request/build/cjs/index";
import { bridges } from "consts/bridges";
import { getSnapshotsQuery } from "./queries/getSnapshots";

export const useSnapshots = () => {
  return useSWR("all", async () => {
    return Promise.all(
      bridges.map((bridge) => request(bridge.inboxEndpoint, getSnapshotsQuery))
    );
  });
};
