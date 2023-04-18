import React from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";
import styled from "styled-components";
import SnapshotAccordion from "./components/SnapshotAccordion/SnapshotAccordion";

const MiddleContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const App = () => (
  <div>
    <Navbar />
    <MiddleContent>
      <SnapshotAccordion
        items={[
          {
            titleProps: {
              epoch: "514512",
              timestamp: "Apr 18, 2023 10:00:00am",
              fromChain: "Arbitrum",
              fromAddress: "0x123456789abcdef",
              toChain: "Ethereum",
              toAddress: "0x987654321fedcba",
              status: "Resolved",
            },
            txCardProps: {
              title: "Verifier",
              chain: "Arbitrum",
              txHash: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
              timestamp: "Mar 30, 2023 15:25:23pm",
              caller: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
              extraFields: [
                {
                  key: "State Root",
                  value: "0x2a3d585f4ecaab46b138ec8d87238da44b32eeab",
                  isCopy: true,
                },
              ],
            },
          },
          {
            titleProps: {
              epoch: "514512",
              timestamp: "Apr 18, 2023 10:00:00am",
              fromChain: "Arbitrum",
              fromAddress: "0x123456789abcdef",
              toChain: "Ethereum",
              toAddress: "0x987654321fedcba",
              status: "Resolved",
            },
            txCardProps: {
              title: "Verifier",
              chain: "Arbitrum",
              txHash: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
              timestamp: "Mar 30, 2023 15:25:23pm",
              caller: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
              extraFields: [
                {
                  key: "State Root",
                  value: "0x2a3d585f4ecaab46b138ec8d87238da44b32eeab",
                  isCopy: true,
                },
              ],
            },
          },
          {
            titleProps: {
              epoch: "514512",
              timestamp: "Apr 18, 2023 10:00:00am",
              fromChain: "Arbitrum",
              fromAddress: "0x123456789abcdef",
              toChain: "Ethereum",
              toAddress: "0x987654321fedcba",
              status: "Resolved",
            },
            txCardProps: {
              title: "Verifier",
              chain: "Arbitrum",
              txHash: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
              timestamp: "Mar 30, 2023 15:25:23pm",
              caller: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
              extraFields: [
                {
                  key: "State Root",
                  value: "0x2a3d585f4ecaab46b138ec8d87238da44b32eeab",
                  isCopy: true,
                },
              ],
            },
          },
        ]}
      />
    </MiddleContent>
    <Footer />
  </div>
);

export default App;
