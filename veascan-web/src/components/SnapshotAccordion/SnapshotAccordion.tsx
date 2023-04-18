import { CustomAccordion } from "@kleros/ui-components-library";
import TxCard, { TxCardProps } from "./TxCard";
import AccordionTitle, { AccordionTitleProps } from "./AccordionTitle";
import styled from "styled-components";
import React from "react";

const StyledSnapshotAccordionGlobal = styled(CustomAccordion)`
  display: flex;
  width: auto;
  margin: 0 auto;

  button.accordion-button {
    border: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-radius: 3px;
  }

  svg.accordion-svg path {
    fill: ${({ theme }) => theme.color.blue};
  }
`;

interface SnapshotAccordionProps {
  items: {
    titleProps: AccordionTitleProps;
    txCardProps: TxCardProps;
  }[];
}

const SnapshotAccordion: React.FC<SnapshotAccordionProps> = (p) => {
  return (
    <StyledSnapshotAccordionGlobal
      items={p.items.map((item, index) => ({
        key: index,
        title: <AccordionTitle {...item.titleProps} />,
        body: <TxCard {...item.txCardProps} />,
      }))}
    />
  );
};

export default SnapshotAccordion;
