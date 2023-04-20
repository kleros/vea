import { arbitrumGoerli, goerli } from "@wagmi/chains";
import { useSnapshots } from "hooks/useSnapshots";
import React from "react";
import styled from "styled-components";
import Footer from "./Footer";
import Navbar from "./Navbar";
import SnapshotAccordion from "./components/SnapshotAccordion/SnapshotAccordion";

const MiddleContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const App = () => {
  // get query data
  const { data } = useSnapshots("999999999999");

  // then generate an Array of objects with the necessary fields
  let dataForSnapshotAccordion;
  if (data) {
    console.log(data);
    dataForSnapshotAccordion = data?.[0]?.map((item) => ({
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
    console.log(dataForSnapshotAccordion);
  }

  if (data) {
    return (
      <div>
        <Navbar />
        <MiddleContent>
          <SnapshotAccordion items={dataForSnapshotAccordion} />
        </MiddleContent>
        <Footer />
      </div>
    );
  } else
    return (
      <div>
        <Navbar />
        <MiddleContent>
          <p>loading...</p>
        </MiddleContent>
        <Footer />
      </div>
    );
};

export default App;
