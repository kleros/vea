import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { useList } from "react-use";
import { StandardPagination } from "@kleros/ui-components-library";
import Layout from "components/Layout";
import SnapshotAccordion from "components/SnapshotAccordion";
import TxFilterHeader from "components/TxFilterHeader";
import { getSnapshotId, useSnapshots } from "hooks/useSnapshots";
import { mapDataForAccordion } from "utils/mapDataForAccordion";
import { useFiltersContext } from "./contexts/FiltersContext";
import { Network } from "./consts/bridges";

const SNAPSHOTS_PER_PAGE = 5;

const StyledPagination = styled.div`
  margin-top: 32px;
  margin-left: auto;
`;

interface IPageTracking {
  timestamp: string;
  shownSnapshots: Set<string>;
}

const App = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [
    pageTracking,
    {
      push: pushPageTracking,
      removeAt: removeAtPageTracking,
      clear: clearPageTracking,
    },
  ] = useList<IPageTracking>();
  const { data } = useSnapshots(
    pageTracking.at(-1)?.shownSnapshots,
    pageTracking.at(-1)?.timestamp,
    SNAPSHOTS_PER_PAGE
  );

  const { fromChain, toChain, statusFilter, setNetwork } = useFiltersContext();

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.startsWith("testnet.")) {
      setNetwork(Network.TESTNET);
    }
  }, []);
  useEffect(() => {
    if (currentPage !== 1) {
      clearPageTracking();
      setCurrentPage(1);
    }
  }, [fromChain, toChain, statusFilter]);

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
          <SnapshotAccordion
            key={currentPage}
            items={mapDataForAccordion(data.snapshots)}
          />
          <StyledPagination>
            <StandardPagination
              numPages={data.isMorePages ? currentPage + 1 : currentPage}
              currentPage={currentPage}
              callback={handlePageChange}
              hideNumbers
            />
          </StyledPagination>
        </>
      ) : (
        <p>loading...</p>
      )}
    </Layout>
  );
};

export default App;
