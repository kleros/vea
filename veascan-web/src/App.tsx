import React, { useState, useCallback } from "react";
import { useList } from "react-use";
import { BigNumber } from "ethers";
import { StandardPagination } from "@kleros/ui-components-library";
import Layout from "components/Layout";
import SnapshotAccordion from "components/SnapshotAccordion/SnapshotAccordion";
import TxFilterHeader from "components/TxFilterHeader";
import { useSnapshots, getSnapshotId } from "hooks/useSnapshots";
import { mapDataForAccordion } from "utils/mapDataForAccordion";

const SNAPSHOTS_PER_PAGE = 5;

interface IPageTracking {
  timestamp: string;
  shownSnapshots: Set<string>;
}

const App = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [
    pageTracking,
    { push: pushPageTracking, removeAt: removeAtPageTracking },
  ] = useList<IPageTracking>();
  const { data } = useSnapshots(
    pageTracking.at(-1)?.shownSnapshots,
    pageTracking.at(-1)?.timestamp,
    SNAPSHOTS_PER_PAGE
  );
  const numPages = data?.totalSnapshots
    .div(BigNumber.from(SNAPSHOTS_PER_PAGE))
    .toNumber();
  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage > currentPage)
        pushPageTracking({
          timestamp: data?.snapshots.at(-1)?.[0].timestamp,
          shownSnapshots: new Set(
            data?.snapshots.map((snapshot) => getSnapshotId(snapshot[0]))
          ),
        });
      else removeAtPageTracking(-1);
      setCurrentPage(newPage);
    },
    [data, currentPage, pushPageTracking, removeAtPageTracking]
  );
  return (
    <Layout>
      <TxFilterHeader />
      {data ? (
        <>
          <SnapshotAccordion items={mapDataForAccordion(data.snapshots)} />
          {numPages && numPages > 0 && (
            <StandardPagination
              numPages={numPages!}
              currentPage={currentPage}
              callback={handlePageChange}
            />
          )}
        </>
      ) : (
        <p>loading...</p>
      )}
    </Layout>
  );
};

export default App;
