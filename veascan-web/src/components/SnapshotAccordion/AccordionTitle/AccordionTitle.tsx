import React, { Dispatch, SetStateAction, useEffect } from "react";
import styled from "styled-components";
import RightArrowLogo from "tsx:svgs/icons/right-arrow.svg";
import { bridges, getChain } from "src/consts/bridges";
import { formatTimestampToHumanReadable } from "src/utils/formatTimestampToHumanReadable";
import ColoredLabel, { variantColors } from "./ColoredLabel";
import Epoch from "./Epoch";
import Timestamp from "./Timestamp";
import ChainAndAddress from "./ChainAndAddress";

const StyledSnapshotAccordionTitle = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  width: 95%;
`;

const StyledChainsAndAddressesContainer = styled.div`
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  color: ${({ theme }) => theme.color.blue};
`;

const ArrowContainer = styled.div`
  position: relative;
  padding-left: 18px;
  padding-right: 10px;
  padding-top: 3.5px;
`;

const StyledRightArrowIcon = styled.svg`
  position: relative;
  width: 17px;
  height: 17px;
  fill: none;
`;

const StyledColoredLabel = styled(ColoredLabel)`
  margin-left: auto;
  padding-right: calc(12px - (12) * (100vw - 370px) / (1250 - 370));
`;

const StyledEpochAndTimestamp = styled.div`
  display: flex;
  justify-content: start;
  gap: 24px;
  margin-right: auto;
`;

export interface SnapshotInboxDataType {
  bridgeIndex: number;
  caller: string;
  epoch: string;
  id: string;
  numberMessages: string;
  resolving: boolean;
  stateRoot: string;
  taken: boolean;
  timestamp: string;
  txHash: string;
}

export interface AccordionTitleProps {
  snapshotInboxData: SnapshotInboxDataType;
  snapshotOutboxData: any;
  snapshotStatus: string;
  setSnapshotStatus: Dispatch<SetStateAction<string>>;
}

const SnapshotAccordionTitle: React.FC<AccordionTitleProps> = ({
  snapshotInboxData,
  snapshotOutboxData,
  snapshotStatus,
  setSnapshotStatus,
}) => {
  useEffect(() => {
    calculateSnapshotStatus(snapshotOutboxData);
  }, []);

  const calculateSnapshotStatus = (snapshotOutboxData: any) => {
    if (!snapshotOutboxData) {
      setSnapshotStatus("Taken");
    } else {
      //todo all statuses
      setSnapshotStatus("Resolved");
    }
  };

  const bridgeInfo = bridges[snapshotInboxData.bridgeIndex];
  const titleParams = {
    epoch: snapshotInboxData.epoch,
    timestamp: formatTimestampToHumanReadable(snapshotInboxData.timestamp),
    fromChain: bridgeInfo.from,
    fromAddress: bridgeInfo.inboxAddress,
    toChain: bridgeInfo.to,
    toAddress: bridgeInfo.outboxAddress,
  };
  const fromChainObject = getChain(titleParams.fromChain);
  const toChainObject = getChain(titleParams.toChain);
  return (
    <StyledSnapshotAccordionTitle>
      <StyledEpochAndTimestamp>
        <Epoch epoch={titleParams.epoch} />
        <Timestamp timestamp={titleParams.timestamp} />
      </StyledEpochAndTimestamp>

      <StyledChainsAndAddressesContainer>
        <ChainAndAddress
          chainObject={fromChainObject}
          address={titleParams.fromAddress}
        />
        <ArrowContainer>
          <StyledRightArrowIcon as={RightArrowLogo} />
        </ArrowContainer>
        <ChainAndAddress
          chainObject={toChainObject}
          address={titleParams.toAddress}
        />
      </StyledChainsAndAddressesContainer>

      <StyledColoredLabel
        text={snapshotStatus}
        variant={snapshotStatus as keyof typeof variantColors}
      />
    </StyledSnapshotAccordionTitle>
  );
};

export default SnapshotAccordionTitle;
