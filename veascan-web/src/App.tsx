import Layout from "components/Layout";
import SnapshotAccordion from "components/SnapshotAccordion/SnapshotAccordion";
import TxFilterHeader from "components/TxFilterHeader";
import { useSnapshots } from "hooks/useSnapshots";
import React from "react";
import { mapDataForAccordion } from "utils/mapDataForAccordion";

const App = () => {
  const { data } = useSnapshots("999999999999");
  return (
    <Layout>
      <TxFilterHeader />
      {data ? (
        <SnapshotAccordion items={mapDataForAccordion(data)} />
      ) : (
        <p>loading...</p>
      )}
    </Layout>
  );
};

export default App;
