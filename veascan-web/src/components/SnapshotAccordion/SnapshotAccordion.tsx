import { CustomAccordion } from "@kleros/ui-components-library";
import TxCard, { TxCardProps } from "./AccordionBody/TxCard";
import AccordionTitle, {
  AccordionTitleProps,
} from "./AccordionTitle/AccordionTitle";
import styled from "styled-components";
import React from "react";
import AccordionBody, {
  AccordionBodyProps,
} from "./AccordionBody/AccordionBody";

const StyledSnapshotAccordionGlobal = styled(CustomAccordion)`
  display: flex;
  width: auto;
  margin: 0 auto;

  button.accordion-button {
    border: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-radius: 3px;
  }

  .accordion-item__Collapsible-sc-17yp2l-1:not(.tVZBd) {
    border-bottom: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-radius: 3px;
    height: auto;
  }

  .accordion-item__Body-sc-17yp2l-2.jjLCsn {
    background-color: ${({ theme }) => theme.color.secondaryPurple};
    border-right: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-left: 1px solid ${({ theme }) => theme.color.secondaryBlue};
  }

  svg.accordion-svg path {
    fill: ${({ theme }) => theme.color.blue};
  }
`;

interface SnapshotAccordionProps {
  items: {
    titleProps: AccordionTitleProps;
    bodyProps: AccordionBodyProps;
  }[];
}

const SnapshotAccordion: React.FC<SnapshotAccordionProps> = (p) => {
  return (
    <StyledSnapshotAccordionGlobal
      items={p.items.map((item, index) => ({
        key: index,
        title: <AccordionTitle {...item.titleProps} />,
        body: <AccordionBody {...item.bodyProps} />,
      }))}
    />
  );
};

export default SnapshotAccordion;
