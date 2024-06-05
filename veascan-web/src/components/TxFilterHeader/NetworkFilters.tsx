import React from "react";
import styled, { css } from "styled-components";
import { smallScreenStyle } from "styles/smallScreenStyle";
import { getChain, bridges } from "consts/bridges";
import { useFiltersContext } from "contexts/FiltersContext";
import Globe from "tsx:svgs/icons/globe.svg";
import { FilterDropdown } from "./FilterDropdown";

const Container = styled.div`
  display: flex;
  gap: 50px;
  position: relative;
  right: 40px;
  ${smallScreenStyle(css`
    right: 0px;
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

interface IItem {
  text: string;
  Icon: React.FC<React.SVGAttributes<SVGElement>>;
  value: number;
}

const { toChains, fromChains } = bridges.reduce<{
  toChains: IItem[];
  fromChains: IItem[];
  uniqueToChains: Set<number>;
  uniqueFromChains: Set<number>;
}>(
  (
    { toChains, fromChains, uniqueToChains, uniqueFromChains },
    { to, from }
  ) => {
    if (!uniqueFromChains.has(from)) {
      const fromChain = getChain(from);
      fromChains.push({
        text: fromChain.name,
        Icon: fromChain.logo,
        value: fromChain.id,
      });
      uniqueFromChains.add(fromChain.id);
    }
    if (!uniqueToChains.has(to)) {
      const toChain = getChain(to);
      toChains.push({
        text: toChain.name,
        Icon: toChain.logo,
        value: toChain.id,
      });
      uniqueToChains.add(toChain.id);
    }
    return { toChains, fromChains, uniqueToChains, uniqueFromChains };
  },
  {
    toChains: [{ text: "All Networks", Icon: Globe, value: 0 }],
    fromChains: [{ text: "All Networks", Icon: Globe, value: 0 }],
    uniqueToChains: new Set<number>(),
    uniqueFromChains: new Set<number>(),
  }
);

const NetworkFilters = () => {
  const { fromChain, setFromChain, toChain, setToChain } = useFiltersContext();
  return (
    <Container>
      <DropdownTag>
        <small>From: </small>
        <FilterDropdown
          isAlignRight={false}
          isSimpleButton
          itemData={fromChains}
          value={fromChain}
          callback={setFromChain}
        />
      </DropdownTag>

      <DropdownTag>
        <small>To: </small>
        <FilterDropdown
          isAlignRight={false}
          isSimpleButton
          itemData={toChains}
          value={toChain}
          callback={setToChain}
        />
      </DropdownTag>
    </Container>
  );
};

export default NetworkFilters;
