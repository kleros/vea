import React from "react";
import styled, { css } from "styled-components";
import Footer from "./Footer";
import Navbar from "./Navbar";
import { useSnapshots } from "hooks/useSnapshots";
import SnapshotAccordion from "./components/SnapshotAccordion/SnapshotAccordion";
import TxFilterHeader from "./components/TxFilterHeader";
import { mapDataForAccordion } from "./utils/mapDataForAccordion";
import { smallScreenStyle } from "./styles/smallScreenStyle";

const MiddleContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 auto;
  ${smallScreenStyle(css`
    margin: 0 5%;
  `)}
  max-width: 1120px;
`;

const App = () => {
  const { data } = useSnapshots("999999999999");
  return (
    <div>
      <Navbar />
      <MiddleContent>
        <TxFilterHeader />
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
