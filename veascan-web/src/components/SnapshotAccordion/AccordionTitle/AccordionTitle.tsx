import React, { Dispatch, SetStateAction, useEffect } from "react";
import styled from "styled-components";
import RightArrowLogo from "tsx:svgs/icons/right-arrow.svg";
import { bridges, getChain } from "src/consts/bridges";
import { formatTimestampToHumanReadable } from "src/utils/formatTimestampToHumanReadable";
import ColoredLabel, { variantColors } from "./ColoredLabel";

const StyledSnapshotAccordionTitle = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  width: 95%;
`;

const StyledEpoch = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  width: 35%;
`;

const StyledTimestamp = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  white-space: nowrap;
`;

const StyledChainsAndAddressesContainer = styled.div`
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  color: ${({ theme }) => theme.color.blue};
`;

const StyledChainAndAddress = styled.div`
  position: relative;
  display: flex;
  flex-direction: row;
`;

const ArrowContainer = styled.div`
  position: relative;
  padding-left: 18px;
  padding-right: 10px;
  padding-top: 3.5px;
`;

const ChainIcon = styled.svg`
  position: relative;
  width: 24px;
  height: 28px;
  fill: none;
  margin-right: 8px;
  padding-bottom: 2px;
`;

const StyledRightArrowIcon = styled.svg`
  position: relative;
  width: 17px;
  height: 17px;
  fill: none;
`;

const StyledTruncatedAddress = styled.a`
  display: flex;
  padding-top: 3.5px;
  color: ${({ theme }) => theme.color.blue};
  text-decoration: none;

  :hover {
    text-decoration: underline;
  }
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

  const truncatedFromAddress = `${titleParams.fromAddress.slice(
    0,
    6
  )}...${titleParams.fromAddress.slice(-4)}`;
  const truncatedToAddress = `${titleParams.toAddress.slice(
    0,
    6
  )}...${titleParams.toAddress.slice(-4)}`;
  const fromChainObject = getChain(titleParams.fromChain);
  const toChainObject = getChain(titleParams.toChain);
  return (
    <StyledSnapshotAccordionTitle>
      <StyledEpochAndTimestamp>
        <StyledEpoch> {titleParams.epoch} </StyledEpoch>
        <StyledTimestamp>{titleParams.timestamp}</StyledTimestamp>
      </StyledEpochAndTimestamp>

      <StyledChainsAndAddressesContainer>
        <StyledChainAndAddress>
          <ChainIcon as={fromChainObject?.logo} />
          <StyledTruncatedAddress
            href={`${fromChainObject?.blockExplorers?.default.url}/address/${titleParams.fromAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            {truncatedFromAddress}
          </StyledTruncatedAddress>
        </StyledChainAndAddress>
        <ArrowContainer>
          <StyledRightArrowIcon as={RightArrowLogo} />
        </ArrowContainer>
        <StyledChainAndAddress>
          <ChainIcon as={toChainObject?.logo} />
          <StyledTruncatedAddress
            href={`${toChainObject?.blockExplorers?.default.url}/address/${titleParams.toAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            {truncatedToAddress}
          </StyledTruncatedAddress>
        </StyledChainAndAddress>
      </StyledChainsAndAddressesContainer>

      <StyledColoredLabel
        text={snapshotStatus}
        variant={snapshotStatus as keyof typeof variantColors}
      />
    </StyledSnapshotAccordionTitle>
  );
};

export default SnapshotAccordionTitle;
