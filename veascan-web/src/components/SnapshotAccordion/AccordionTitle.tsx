import React from "react";
import styled from "styled-components";
import ArbitrumLogo from "tsx:svgs/chains/arbitrum.svg";
import EthereumLogo from "tsx:svgs/chains/ethereum.svg";
import RightArrowLogo from "tsx:svgs/icons/right-arrow.svg";
import ColoredLabel, { variantColors } from "./ColoredLabel";

const StyledSnapshotAccordionTitle = styled.div`
  display: flex;
  align-items: center;
  height: 40px;
`;

const StyledEpoch = styled.div`
  color: ${({ theme }) => theme.color.blue};
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
  color: ${({ theme }) => theme.color.blue};
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

const StyledTruncatedAddress = styled.div`
  display: flex;
  padding-top: 3.5px;
`;

const StyledColoredLabelContainer = styled.div`
  margin-right: 32px;
`;

export interface AccordionTitleProps {
  epoch: string;
  timestamp: string;
  fromChain: string;
  fromAddress: string;
  toChain: string;
  toAddress: string;
  status: string;
}

const SnapshotAccordionTitle: React.FC<AccordionTitleProps> = (p) => {
  const truncatedFromAddress = `${p.fromAddress.slice(
    0,
    6
  )}...${p.fromAddress.slice(-4)}`;
  const truncatedToAddress = `${p.toAddress.slice(0, 6)}...${p.toAddress.slice(
    -4
  )}`;

  return (
    <StyledSnapshotAccordionTitle>
      <StyledEpoch>{p.epoch}</StyledEpoch>

      <StyledTimestamp>{p.timestamp}</StyledTimestamp>
      <StyledChainsAndAddressesContainer>
        <StyledChainAndAddress>
          <ChainIcon
            as={p.fromChain === "Ethereum" ? EthereumLogo : ArbitrumLogo}
          />
          <StyledTruncatedAddress>
            {truncatedFromAddress}
          </StyledTruncatedAddress>
        </StyledChainAndAddress>
        <ArrowContainer>
          <StyledRightArrowIcon as={RightArrowLogo} />
        </ArrowContainer>
        <StyledChainAndAddress>
          <ChainIcon
            as={p.toChain === "Ethereum" ? EthereumLogo : ArbitrumLogo}
          />
          <StyledTruncatedAddress>{truncatedToAddress}</StyledTruncatedAddress>
        </StyledChainAndAddress>
      </StyledChainsAndAddressesContainer>

      <StyledColoredLabelContainer>
        <ColoredLabel
          text={p.status}
          variant={p.status as keyof typeof variantColors}
        />
      </StyledColoredLabelContainer>
    </StyledSnapshotAccordionTitle>
  );
};

export default SnapshotAccordionTitle;
