import { arbitrumGoerli, goerli } from "@wagmi/chains";
import { useSnapshots } from "hooks/useSnapshots";
import React from "react";
import styled from "styled-components";
import Footer from "./Footer";
import Navbar from "./Navbar";
import SnapshotAccordion from "./components/SnapshotAccordion/SnapshotAccordion";
import TxFilterHeader from "./components/TxFilterHeader";

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
        <SnapshotAccordion
          items={[
            {
              titleProps: {
                epoch: "810212",
                timestamp: "Apr 18, 2023 99:00:00am",
                fromChain: "Arbitrum",
                fromAddress: "0x123456789abcdef",
                toChain: "Ethereum",
                toAddress: "0x987654321fedcba",
                status: "Resolved",
              },
              txCardProps: {
                title: "Verifier",
                chain: goerli.id,
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
                epoch: "999999",
                timestamp: "Jun 20, 2020 09:00:00pm",
                fromChain: "Arbitrum",
                fromAddress: "0x123456789abcdef",
                toChain: "Ethereum",
                toAddress: "0x987654321fedcba",
                status: "Taken",
              },
              txCardProps: {
                title: "Verifier",
                chain: arbitrumGoerli.id,
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
                epoch: "111111",
                timestamp: "Dec 18, 2023 8:00:00am",
                fromChain: "Ethereum",
                fromAddress: "0x123456789abcdef",
                toChain: "Arbitrum",
                toAddress: "0x987654321fedcba",
                status: "Resolving",
              },
              txCardProps: {
                title: "Verifier",
                chain: goerli.id,
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
};

export default App;
