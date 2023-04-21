import { arbitrumGoerli, goerli } from "@wagmi/chains";
import { useSnapshots } from "hooks/useSnapshots";
import React from "react";
import styled from "styled-components";
import Footer from "./Footer";
import Navbar from "./Navbar";
import SnapshotAccordion from "./components/SnapshotAccordion/SnapshotAccordion";
import { bridges, getChain } from "./consts/bridges";

const MiddleContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const getFormattedDataForAccordion = (data: any) => {
  const formattedDataForAccordion = data.map(([inboxData, outboxData]) => {
    const bridgeInfo = bridges[inboxData.bridgeIndex];
    console.log(bridgeInfo);
    return {
      titleProps: {
        epoch: inboxData?.epoch,
        timestamp: inboxData?.timestamp,
        fromChain: bridgeInfo.from,
        fromAddress: bridgeInfo.inboxAddress,
        toChain: bridgeInfo.to,
        toAddress: bridgeInfo.outboxAddress,
        status: "Resolved",
      },
      bodyProps: {
        snapshotDetailsProps: {
          title: "Verifier",
          chain: bridgeInfo.from,
          txHash: inboxData?.txHash,
          timestamp: inboxData?.timestamp,
          caller: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
          extraFields: [
            {
              key: "State Root",
              value: inboxData?.stateRoot,
              isCopy: true,
            },
          ],
        },
        newMessagesProps: {
          title: "Verifier",
          chain: bridgeInfo.from,
          txHash: inboxData?.txHash,
          timestamp: inboxData?.timestamp,
          caller: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
          extraFields: [
            {
              key: "State Root",
              value: inboxData?.stateRoot,
              isCopy: true,
            },
          ],
        },
      },
    };
  });
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
