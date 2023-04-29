import { IChain, supportedChains } from "consts/bridges";
import React, { FC } from "react";
import styled, { css } from "styled-components";
import Globe from "tsx:svgs/icons/globe.svg";
import { smallScreenStyle } from "styles/smallScreenStyle";
import { theme } from "styles/themes";
import { FilterDropdown } from "./FilterDropdown";

const STATUS_ITEMS = [
  { text: "All", dot: theme.color.white, value: 1 },
  { text: "Invalid", dot: theme.color.lightRed, value: 2 },
  { text: "Taken", dot: theme.color.lightYellow, value: 3 },
  { text: "Claimed", dot: theme.color.turquoise, value: 4 },
  { text: "Challenged", dot: theme.color.lightPurple, value: 5 },
  { text: "Verified", dot: theme.color.darkBlue, value: 6 },
  { text: "Expired", dot: theme.color.smoke, value: 7 },
  { text: "Resolving", dot: theme.color.teal, value: 8 },
  { text: "Resolved", dot: theme.color.green, value: 9 },
];

const CHAIN_ITEMS = [{ text: "All Networks", Icon: Globe, value: 1 }].concat(
  supportedChains.map((chain: IChain, i: number) => ({
    text: chain.name,
    Icon: chain.logo,
    value: i + 2,
  }))
);

const HeaderText = styled.h5`
  font-size: 24px;
  text-transform: lowercase;
  color: ${({ theme }) => theme.color.lightBlue};
  line-height: 24px;
`;

const SnapshotHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 64px;
  margin: 76px auto 24px auto;
  width: 100%;

  ${smallScreenStyle(css`
    margin-top: 60px;
  `)}
`;

const FilterHeader = styled.div`
  display: flex;
  margin-left: 33px;
  align-items: start;
  flex-wrap: wrap;
  justify-content: space-between;
  ${smallScreenStyle(css`
    margin-left: calc(0px + (33) * (100vw - 370px) / (1250 - 370));
    gap: 12px;
  `)}
`;

const NetworkFilters = styled.div`
  display: flex;
  gap: 50px;
`;

const DropdownTag = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
  min-width: 140px;
  white-space: nowrap;
  small {
    font-size: 14px;
    line-height: 17.5px;
    color: ${({ theme }) => theme.color.blue} !important;
  }
`;

const EpochAndTimeTag = styled.div`
  display: flex;
  gap: 30px;
  margin-right: 180px;
  small {
    font-family: "Oxanium";
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    line-height: 18px;
    color: ${({ theme }) => theme.color.lightBlue} !important;
  }

  ${smallScreenStyle(css`
    display: none;
  `)}
`;

const TxFilterHeader: FC = () => {
  return (
    <SnapshotHeader>
      <HeaderText>Latest Snapshots</HeaderText>
      <FilterHeader>
        <EpochAndTimeTag>
          <small>Epoch ID</small>
          <small>Timestamp</small>
        </EpochAndTimeTag>
        <NetworkFilters>
          <DropdownTag>
            <small>From: </small>
            <FilterDropdown
              isAlignRight={false}
              isSimpleButton
              itemData={CHAIN_ITEMS}
            />
          </DropdownTag>

          <DropdownTag>
            <small>To: </small>
            <FilterDropdown
              isAlignRight={false}
              isSimpleButton
              itemData={CHAIN_ITEMS}
            />
          </DropdownTag>
        </NetworkFilters>
        <DropdownTag>
          <small>Status: </small>
          <FilterDropdown
            isAlignRight={true}
            isSimpleButton
            itemData={STATUS_ITEMS}
          />
        </DropdownTag>
      </FilterHeader>
    </SnapshotHeader>
  );
};

export default TxFilterHeader;
