import { arbitrumGoerli, goerli } from "@wagmi/chains";
import { useSnapshots } from "hooks/useSnapshots";
import React from "react";
import styled from "styled-components";
import Footer from "./Footer";
import Navbar from "./Navbar";
import SnapshotAccordion from "./components/SnapshotAccordion/SnapshotAccordion";
import TxFilterHeader from "./components/TxFilterHeader";
import { formatDataForAccordion } from "./utils/formatDataForAccordion";

const MiddleContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const App = () => {
  // get query data
  const { data } = useSnapshots("999999999999");
  console.log(data);

  return (
    <div>
      <Navbar />
      <MiddleContent>
        <TxFilterHeader />
        {data ? (
          <SnapshotAccordion items={formatDataForAccordion(data)} />
        ) : (
          <p>loading...</p>
        )}
      </MiddleContent>
      <Footer />
    </div>
  );
};

export default App;
