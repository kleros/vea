import React, { useEffect } from "react";
import styled from "styled-components";
import RightArrowLogo from "tsx:svgs/icons/right-arrow.svg";
import { bridges, getChain } from "~src/consts/bridges";
import { formatTimestampToHumanReadable } from "~src/utils/formatTimestampToHumanReadable";
import ColoredLabel, { variantColors } from "./ColoredLabel";
import SnapshotStatus from "./SnapshotStatus";

const StyledSnapshotAccordionTitle = styled.div`
  display: flex;
  align-items: center;
  height: 40px;
`;

const StyledEpoch = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  width: 60px;
  margin-right: 32px;
`;

const StyledTimestamp = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  width: 220px;
  margin-right: 32px;
`;

const StyledChainsAndAddressesContainer = styled.div`
  position: relative;
  display: flex;
  color: ${({ theme }) => theme.color.blue};
  padding-right: 308.5px;
  margin-right: 32px;
  width: 590px;
`;

const StyledChainAndAddress = styled.div`
  position: relative;
  padding-left: 5px;
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

const StyledColoredLabelContainer = styled.div`
  margin-right: 32px;
`;

export interface AccordionTitleProps {
  snapshotInboxData: any;
  snapshotOutboxData: any;
  snapshotStatus: any;
  setSnapshotStatus: any;
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
    status:
      // bridgeInfo.from === 421613 || bridgeInfo.from === 42161 ? "Taken" : "Resolved",
      "Resolved",
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
      <StyledEpoch href="" target="_blank" rel="noreferrer">
        {titleParams.epoch}
      </StyledEpoch>

      <StyledTimestamp>{titleParams.timestamp}</StyledTimestamp>
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

      <StyledColoredLabelContainer>
        <ColoredLabel
          text={snapshotStatus}
          variant={snapshotStatus as keyof typeof variantColors}
        />
      </StyledColoredLabelContainer>
    </StyledSnapshotAccordionTitle>
  );
};

export default SnapshotAccordionTitle;
