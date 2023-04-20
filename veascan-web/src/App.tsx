import { arbitrumGoerli, goerli } from "@wagmi/chains";
import { useSnapshots } from "hooks/useSnapshots";
import React from "react";
import styled from "styled-components";
import Footer from "./Footer";
import Navbar from "./Navbar";
import SnapshotAccordion from "./components/SnapshotAccordion/SnapshotAccordion";
import { getChain } from "./consts/bridges";

const MiddleContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const getFormattedDataForAccordion = (data: any) => {
  const formattedDataForAccordion = data?.[0]?.map((item) => ({
    titleProps: {
      epoch: item?.epoch,
      timestamp: item?.timestamp,
      fromChain: "Arbitrum",
      fromAddress: "0x123456789abcdef",
      toChain: "Ethereum",
      toAddress: "0x987654321fedcba",
      status: "Resolved",
    },
    bodyProps: {
      snapshotDetailsProps: {
        title: "Verifier",
        chain: "Arbitrum",
        txHash: item?.txHash,
        timestamp: item?.timestamp,
        caller: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
        extraFields: [
          {
            key: "State Root",
            value: item?.stateRoot,
            isCopy: true,
          },
        ],
      },
    },
  }));
  return formattedDataForAccordion;
};

const App = () => {
  // get query data
  const { data } = useSnapshots("999999999999");
  console.log(data);

  return (
    <div>
      <Navbar />
      <MiddleContent>
        {data ? (
          <SnapshotAccordion items={getFormattedDataForAccordion(data)} />
        ) : (
          <p>loading...</p>
        )}
      </MiddleContent>
      <Footer />
    </div>
  );
};

export default App;
