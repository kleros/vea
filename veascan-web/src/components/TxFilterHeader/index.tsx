import React from "react";
import styled, { css } from "styled-components";
import { smallScreenStyle } from "styles/smallScreenStyle";
import { useFiltersContext } from "contexts/FiltersContext";
import { FilterDropdown } from "./FilterDropdown";
import NetworkFilters from "./NetworkFilters";

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

const TxFilterHeader: React.FC = () => {
  const { statusItems, statusFilter, setStatusFilter } = useFiltersContext();
  return (
    <SnapshotHeader>
      <HeaderText>Latest Snapshots</HeaderText>
      <FilterHeader>
        <EpochAndTimeTag>
          <small>Epoch ID</small>
          <small>Timestamp</small>
        </EpochAndTimeTag>
        <NetworkFilters />
        <DropdownTag>
          <small>Status: </small>
          <FilterDropdown
            value={statusFilter}
            isAlignRight={true}
            isSimpleButton
            itemData={statusItems}
            callback={setStatusFilter}
          />
        </DropdownTag>
      </FilterHeader>
    </SnapshotHeader>
  );
};

export default TxFilterHeader;
