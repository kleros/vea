import { useSnapshots } from "hooks/useSnapshots";
import React from "react";
import styled from "styled-components";
import Footer from "./Footer";
import Navbar from "./Navbar";
import SnapshotAccordion from "./components/SnapshotAccordion/SnapshotAccordion";
import TxFilterHeader from "./components/TxFilterHeader";
import { mapDataForAccordion } from "./utils/mapDataForAccordion";

const MiddleContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const App = () => {
  const { data } = useSnapshots("999999999999");
  console.log(data);

  return (
    <div>
      <Navbar />
      <TxFilterHeader />
      <MiddleContent>
        {data ? (
          <SnapshotAccordion items={mapDataForAccordion(data)} />
        ) : (
          <p>loading...</p>
        )}
      </MiddleContent>
      <Footer />
    </div>
  );
};

export default App;
