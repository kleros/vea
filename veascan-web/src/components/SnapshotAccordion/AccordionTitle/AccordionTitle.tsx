import { bridges, getBridge, getChain } from "consts/bridges";
import React from "react";
import styled from "styled-components";
import RightArrowLogo from "tsx:svgs/icons/right-arrow.svg";
import { IStatus } from "utils/mapDataForAccordion";
import ChainAndAddress from "./ChainAndAddress";
import ColoredLabel, { variantColors } from "./ColoredLabel";
import Epoch from "./Epoch";
import Timestamp from "./Timestamp";

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
  bridgeId: number;
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
  epoch: string;
  bridgeId: number;
  timestamp: string;
  status: IStatus;
}

const SnapshotAccordionTitle: React.FC<AccordionTitleProps> = ({
  epoch,
  bridgeId,
  timestamp,
  status,
}) => {
  const bridgeInfo = getBridge(bridgeId);
  console.log(bridgeId, bridgeInfo);
  const titleParams = {
    epoch: epoch,
    timestamp: timestamp,
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
        <Epoch epoch={epoch} />
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
        text={parseStatus(status)}
        variant={parseStatus(status)}
      />
    </StyledSnapshotAccordionTitle>
  );
};

const parseStatus = ({
  resolved,
  resolving,
  challenged,
  verified,
  claimed,
}: IStatus): keyof typeof variantColors => {
  if (resolved) return "Resolved";
  if (resolving) return "Resolving";
  if (challenged) return "Challenged";
  if (verified) return "Verified";
  if (claimed) return "Claimed";
  return "Taken";
};

export default SnapshotAccordionTitle;
