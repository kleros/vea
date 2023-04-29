import React, { useEffect } from "react";
import styled, { css } from "styled-components";
import RightArrowLogo from "tsx:svgs/icons/right-arrow.svg";
import { bridges, getChain } from "src/consts/bridges";
import { smallScreenStyle } from "src/styles/smallScreenStyle";
import { formatTimestampToHumanReadable } from "src/utils/formatTimestampToHumanReadable";
import ColoredLabel, { variantColors } from "./ColoredLabel";

const StyledSnapshotAccordionTitle = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px;
  width: 95%;

  ${smallScreenStyle(css`
    max-width: 90%;
    height: 139px;
    align-items: start;
    flex-direction: column;
    justify-content: start;
  `)}
`;

const StyledEpoch = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  width: 35%;

  ${smallScreenStyle(css`
    margin-top: 14px;
  `)}
`;

const StyledTimestamp = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  width: 4%;
  white-space: nowrap;

  ${smallScreenStyle(css`
    margin-top: 14px;
  `)}
`;

const StyledChainsAndAddressesContainer = styled.div`
  position: relative;
  display: flex;
  color: ${({ theme }) => theme.color.blue};
  width: 50.21%;

  ${smallScreenStyle(css`
    margin-left: 0px;
    margin-top: 15px;
  `)}
`;

const StyledChainAndAddress = styled.div`
  position: relative;
  padding-left: 5px;
  display: flex;
  flex-direction: row;

  ${smallScreenStyle(css`
    padding-left: 0px;
  `)}
`;

const ArrowContainer = styled.div`
  position: relative;
  padding-left: 18px;
  padding-right: 10px;
  padding-top: 3.5px;

  ${smallScreenStyle(css`
    padding-left: 8px;
    padding-right: 7px;
  `)}
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
  display: flex;

  ${smallScreenStyle(css`
    padding-left: 0px;
    margin-top: 15px;
  `)}
`;

const StyledEpochAndTimestamp = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: start;
  margin-right: 3.5%;
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
        <StyledEpoch href="" target="_blank" rel="noreferrer">
          {titleParams.epoch}
        </StyledEpoch>

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
